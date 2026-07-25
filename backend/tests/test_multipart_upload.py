"""Multipart (chunked) upload: initiate, complete, and abort."""

FILES = "/api/v1/files"


def test_initiate_multipart_upload_returns_item_and_part_urls(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    resp = client.post(
        f"{FILES}/upload-url/multipart",
        json={"name": "big.mp4", "parent_id": None, "content_type": "video/mp4", "part_count": 3},
        headers=h,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["item"]["name"] == "big.mp4"
    assert body["item"]["status"] == "pending"
    assert body["upload_id"]
    assert len(body["part_urls"]) == 3


def test_initiate_multipart_upload_rejects_zero_parts(client, auth_headers):
    h = auth_headers()
    resp = client.post(
        f"{FILES}/upload-url/multipart",
        json={"name": "big.mp4", "parent_id": None, "content_type": "video/mp4", "part_count": 0},
        headers=h,
    )
    assert resp.status_code == 422


def test_complete_multipart_upload_marks_item_ready(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    init = client.post(
        f"{FILES}/upload-url/multipart",
        json={"name": "big.mp4", "parent_id": None, "content_type": "video/mp4", "part_count": 2},
        headers=h,
    ).json()
    item_id = init["item"]["id"]
    key = fake_item_repo._items[item_id].s3_key
    # Simulate the browser having PUT both parts and S3 now holding the
    # assembled object.
    fake_storage.uploaded[key] = 42_000_000

    resp = client.post(
        f"{FILES}/{item_id}/complete-multipart",
        json={
            "upload_id": init["upload_id"],
            "parts": [{"part_number": 1, "etag": "abc"}, {"part_number": 2, "etag": "def"}],
        },
        headers=h,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["size"] == 42_000_000


def test_complete_multipart_upload_is_owner_only(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    init = client.post(
        f"{FILES}/upload-url/multipart",
        json={"name": "big.mp4", "parent_id": None, "content_type": "video/mp4", "part_count": 1},
        headers=a,
    ).json()
    item_id = init["item"]["id"]

    resp = client.post(
        f"{FILES}/{item_id}/complete-multipart",
        json={"upload_id": init["upload_id"], "parts": [{"part_number": 1, "etag": "x"}]},
        headers=b,
    )
    assert resp.status_code == 404


def test_abort_multipart_upload_removes_the_pending_item(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    init = client.post(
        f"{FILES}/upload-url/multipart",
        json={"name": "big.mp4", "parent_id": None, "content_type": "video/mp4", "part_count": 4},
        headers=h,
    ).json()
    item_id = init["item"]["id"]

    resp = client.post(
        f"{FILES}/{item_id}/abort-multipart",
        json={"upload_id": init["upload_id"]},
        headers=h,
    )
    assert resp.status_code == 204
    assert init["upload_id"] in fake_storage.aborted_multipart_uploads

    # Gone — a subsequent complete has nothing to act on.
    listing = client.get(FILES, headers=h).json()
    assert all(i["id"] != item_id for i in listing["items"])
