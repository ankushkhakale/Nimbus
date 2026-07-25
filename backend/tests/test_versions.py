"""File versioning: snapshot-on-replace, list, restore, download, and
bounded retention."""

from app.services.file_service import MAX_VERSIONS_PER_ITEM

FILES = "/api/v1/files"


def _ready_file(client, h, storage, repo, name, ctype="text/plain", size=100):
    item_id = client.post(
        f"{FILES}/upload-url",
        json={"name": name, "parent_id": None, "content_type": ctype},
        headers=h,
    ).json()["item"]["id"]
    storage.uploaded[repo._items[item_id].s3_key] = size
    client.post(f"{FILES}/{item_id}/complete", headers=h)
    return item_id


def test_new_version_snapshots_current_bytes(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "doc.txt", size=100)
    key = fake_item_repo._items[item_id].s3_key

    # A file starts with no version history.
    assert client.get(f"{FILES}/{item_id}/versions", headers=h).json()["versions"] == []

    resp = client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=h)
    assert resp.status_code == 200
    assert resp.json()["upload_url"]

    # The pre-upload bytes are now snapshotted as version 1.
    versions = client.get(f"{FILES}/{item_id}/versions", headers=h).json()["versions"]
    assert len(versions) == 1
    assert versions[0]["version_number"] == 1
    assert versions[0]["size"] == 100

    # Simulate the browser PUTting the new (larger) bytes, then completing.
    fake_storage.uploaded[key] = 250
    completed = client.post(f"{FILES}/{item_id}/complete-new-version", headers=h).json()
    assert completed["size"] == 250


def test_list_versions_newest_first(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "doc.txt")
    client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=h)
    client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=h)

    numbers = [v["version_number"] for v in client.get(f"{FILES}/{item_id}/versions", headers=h).json()["versions"]]
    assert numbers == [2, 1]


def test_restore_version_makes_it_current_and_snapshots_the_replaced_state(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "doc.txt", size=100)
    key = fake_item_repo._items[item_id].s3_key

    # Snapshot v1 (size 100), then move current to size 300.
    client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=h)
    fake_storage.uploaded[key] = 300
    client.post(f"{FILES}/{item_id}/complete-new-version", headers=h)

    versions = client.get(f"{FILES}/{item_id}/versions", headers=h).json()["versions"]
    v1_id = next(v["id"] for v in versions if v["version_number"] == 1)

    resp = client.post(f"{FILES}/{item_id}/versions/{v1_id}/restore", headers=h)
    assert resp.status_code == 200
    # Current bytes are now v1's (size 100 again).
    assert resp.json()["size"] == 100

    # Restore itself snapshotted the size-300 state, so nothing is lost.
    after = client.get(f"{FILES}/{item_id}/versions", headers=h).json()["versions"]
    assert 300 in [v["size"] for v in after]


def test_version_download_url(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "doc.txt")
    client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=h)
    version_id = client.get(f"{FILES}/{item_id}/versions", headers=h).json()["versions"][0]["id"]

    resp = client.get(f"{FILES}/{item_id}/versions/{version_id}/download-url", headers=h)
    assert resp.status_code == 200
    assert resp.json()["download_url"]


def test_retention_is_bounded(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "doc.txt")

    # One snapshot per call; make more than the cap allows.
    for _ in range(MAX_VERSIONS_PER_ITEM + 3):
        client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=h)

    versions = client.get(f"{FILES}/{item_id}/versions", headers=h).json()["versions"]
    assert len(versions) == MAX_VERSIONS_PER_ITEM
    # The oldest were evicted; numbering kept climbing.
    numbers = sorted(v["version_number"] for v in versions)
    assert numbers[0] == 4  # 13 created, oldest 3 evicted -> 4..13
    assert numbers[-1] == MAX_VERSIONS_PER_ITEM + 3


def test_versions_are_owner_scoped(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    item_id = _ready_file(client, a, fake_storage, fake_item_repo, "doc.txt")
    client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=a)

    # Another user can't see, restore from, or add versions to it.
    assert client.get(f"{FILES}/{item_id}/versions", headers=b).status_code == 404
    assert client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=b).status_code == 404


def test_permanent_delete_removes_version_objects(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "doc.txt")
    client.post(f"{FILES}/{item_id}/new-version-upload-url", headers=h)
    version = client.get(f"{FILES}/{item_id}/versions", headers=h).json()["versions"][0]

    # Trash then permanently delete.
    client.post(f"{FILES}/trash", json={"item_ids": [item_id]}, headers=h)
    client.post(f"{FILES}/delete-permanently", json={"item_ids": [item_id]}, headers=h)

    # The version's document is gone (endpoint 404s on the missing item),
    # and its object was deleted from storage.
    assert client.get(f"{FILES}/{item_id}/versions", headers=h).status_code == 404
    assert len(fake_storage.deleted) >= 2  # main object + at least one version object
    _ = version
