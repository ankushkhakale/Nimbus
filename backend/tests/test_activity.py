"""Activity feed + login-activity log."""

FILES = "/api/v1/files"
AUTH = "/api/v1/auth"


def _folder(client, h, name, parent=None):
    return client.post(f"{FILES}/folders", json={"name": name, "parent_id": parent},
                       headers=h).json()["id"]


def _ready_file(client, h, storage, repo, name, parent=None, ctype="text/plain", size=100):
    item_id = client.post(
        f"{FILES}/upload-url",
        json={"name": name, "parent_id": parent, "content_type": ctype},
        headers=h,
    ).json()["item"]["id"]
    storage.uploaded[repo._items[item_id].s3_key] = size
    client.post(f"{FILES}/{item_id}/complete", headers=h)
    return item_id


# --- activity feed --------------------------------------------------------

def test_upload_records_activity(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "doc.txt")

    feed = client.get(f"{FILES}/activity", headers=h).json()["activity"]
    assert len(feed) == 1
    assert feed[0]["action"] == "uploaded"
    assert feed[0]["item_name"] == "doc.txt"


def test_rename_and_trash_record_activity_newest_first(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "doc.txt")
    client.patch(f"{FILES}/{item_id}", json={"name": "renamed.txt"}, headers=h)
    client.post(f"{FILES}/trash", json={"item_ids": [item_id]}, headers=h)

    actions = [e["action"] for e in client.get(f"{FILES}/activity", headers=h).json()["activity"]]
    # Newest first: trashed, then renamed, then uploaded.
    assert actions == ["trashed", "renamed", "uploaded"]


def test_activity_is_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    _ready_file(client, a, fake_storage, fake_item_repo, "a.txt")

    assert client.get(f"{FILES}/activity", headers=b).json()["activity"] == []


def test_recolor_does_not_clutter_the_feed(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    folder_id = _folder(client, h, "Album")
    client.patch(f"{FILES}/{folder_id}", json={"color": "blue"}, headers=h)

    # Creating a folder isn't an upload, and recolor is cosmetic — neither
    # should appear. The feed only tracks the meaningful file lifecycle.
    assert client.get(f"{FILES}/activity", headers=h).json()["activity"] == []


# --- login activity -------------------------------------------------------

def test_login_is_recorded(client):
    email = "login-test@example.com"
    client.post(
        f"{AUTH}/register",
        json={"email": email, "full_name": "Login Test", "password": "Passw0rd!"},
    )
    login = client.post(f"{AUTH}/login", json={"email": email, "password": "Passw0rd!"})
    token = login.json()["access_token"]

    resp = client.get(
        f"{AUTH}/login-activity", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    logins = resp.json()["logins"]
    assert len(logins) == 1
    assert logins[0]["method"] == "password"


def test_login_activity_requires_auth(client):
    assert client.get(f"{AUTH}/login-activity").status_code == 401
