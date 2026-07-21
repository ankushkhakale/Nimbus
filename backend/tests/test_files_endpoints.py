"""File/folder API tests, including cross-user isolation."""

FILES = "/api/v1/files"


def _folder(client, headers, name="Photos", parent=None):
    return client.post(f"{FILES}/folders", json={"name": name, "parent_id": parent},
                       headers=headers)


def _upload(client, headers, name="a.txt", parent=None, ctype="text/plain"):
    return client.post(f"{FILES}/upload-url",
                       json={"name": name, "parent_id": parent, "content_type": ctype},
                       headers=headers)


# --- auth ---------------------------------------------------------------

def test_all_file_routes_require_auth(client):
    assert client.get(FILES).status_code == 401
    assert client.post(f"{FILES}/folders", json={"name": "x"}).status_code == 401
    assert client.post(f"{FILES}/upload-url", json={"name": "x"}).status_code == 401
    assert client.get(f"{FILES}/000000000000000000000001/download-url").status_code == 401
    assert client.delete(f"{FILES}/000000000000000000000001").status_code == 401


# --- folders ------------------------------------------------------------

def test_create_folder_and_list_at_root(client, auth_headers):
    h = auth_headers()
    r = _folder(client, h)
    assert r.status_code == 201
    assert r.json()["name"] == "Photos"
    assert r.json()["type"] == "folder"

    listing = client.get(FILES, headers=h).json()
    assert [i["name"] for i in listing] == ["Photos"]


def test_nested_folder_listing_is_scoped_to_parent(client, auth_headers):
    h = auth_headers()
    parent = _folder(client, h, "Photos").json()["id"]
    _folder(client, h, "2024", parent)

    assert [i["name"] for i in client.get(FILES, headers=h).json()] == ["Photos"]
    kids = client.get(FILES, params={"parent_id": parent}, headers=h).json()
    assert [i["name"] for i in kids] == ["2024"]


def test_folders_sort_before_files(client, auth_headers):
    h = auth_headers()
    _upload(client, h, "aaa.txt")
    _folder(client, h, "zzz")
    names = [i["name"] for i in client.get(FILES, headers=h).json()]
    assert names == ["zzz", "aaa.txt"]


def test_create_folder_rejects_bad_names(client, auth_headers):
    h = auth_headers()
    for bad in ["", "  ", "..", "a/b", "a\\b", "x\x00y"]:
        assert client.post(f"{FILES}/folders", json={"name": bad}, headers=h).status_code == 422


def test_create_folder_under_missing_parent_is_404(client, auth_headers):
    h = auth_headers()
    r = _folder(client, h, "x", "000000000000000000009999")
    assert r.status_code == 404


def test_cannot_create_folder_under_a_file(client, auth_headers):
    h = auth_headers()
    file_id = _upload(client, h).json()["item"]["id"]
    assert _folder(client, h, "nope", file_id).status_code == 400


# --- uploads ------------------------------------------------------------

def test_upload_url_creates_pending_item(client, auth_headers):
    h = auth_headers()
    body = _upload(client, h).json()
    assert body["item"]["status"] == "pending"
    assert body["item"]["size"] is None
    assert body["upload_url"].startswith("https://upload.test/")
    assert body["expires_in"] > 0


def test_upload_url_never_exposes_the_s3_key(client, auth_headers):
    """The key reveals bucket layout; clients have no need for it."""
    h = auth_headers()
    assert "s3_key" not in _upload(client, h).json()["item"]


def test_complete_upload_records_size_from_storage(client, auth_headers, fake_storage,
                                                   fake_item_repo):
    h = auth_headers()
    item_id = _upload(client, h).json()["item"]["id"]
    key = fake_item_repo._items[item_id].s3_key
    fake_storage.uploaded[key] = 1234  # stands in for the browser's PUT

    r = client.post(f"{FILES}/{item_id}/complete", headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "ready"
    assert r.json()["size"] == 1234


def test_complete_upload_before_bytes_arrive_is_409(client, auth_headers):
    h = auth_headers()
    item_id = _upload(client, h).json()["item"]["id"]
    assert client.post(f"{FILES}/{item_id}/complete", headers=h).status_code == 409


def test_size_comes_from_storage_not_the_client(client, auth_headers, fake_storage,
                                                fake_item_repo):
    """A client cannot under-report usage — size is read from S3."""
    h = auth_headers()
    item_id = _upload(client, h).json()["item"]["id"]
    fake_storage.uploaded[fake_item_repo._items[item_id].s3_key] = 999_999
    r = client.post(f"{FILES}/{item_id}/complete", json={"size": 1}, headers=h)
    assert r.json()["size"] == 999_999


# --- downloads ----------------------------------------------------------

def test_download_url_for_ready_file(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _upload(client, h, "report.pdf").json()["item"]["id"]
    fake_storage.uploaded[fake_item_repo._items[item_id].s3_key] = 10
    client.post(f"{FILES}/{item_id}/complete", headers=h)

    r = client.get(f"{FILES}/{item_id}/download-url", headers=h)
    assert r.status_code == 200
    assert "report.pdf" in r.json()["download_url"]


def test_download_url_for_pending_file_is_409(client, auth_headers):
    h = auth_headers()
    item_id = _upload(client, h).json()["item"]["id"]
    assert client.get(f"{FILES}/{item_id}/download-url", headers=h).status_code == 409


def test_download_url_for_folder_is_400(client, auth_headers):
    h = auth_headers()
    folder_id = _folder(client, h).json()["id"]
    assert client.get(f"{FILES}/{folder_id}/download-url", headers=h).status_code == 400


# --- rename / move ------------------------------------------------------

def test_rename_item(client, auth_headers):
    h = auth_headers()
    item_id = _folder(client, h, "Old").json()["id"]
    r = client.patch(f"{FILES}/{item_id}", json={"name": "New"}, headers=h)
    assert r.status_code == 200 and r.json()["name"] == "New"


def test_move_item_into_folder(client, auth_headers):
    h = auth_headers()
    dest = _folder(client, h, "Dest").json()["id"]
    item_id = _upload(client, h).json()["item"]["id"]
    r = client.patch(f"{FILES}/{item_id}", json={"parent_id": dest}, headers=h)
    assert r.json()["parent_id"] == dest
    assert [i["id"] for i in client.get(FILES, params={"parent_id": dest}, headers=h).json()] == [item_id]


def test_rename_without_parent_field_does_not_move(client, auth_headers):
    """parent_id absent must not be read as 'move to root'."""
    h = auth_headers()
    parent = _folder(client, h, "P").json()["id"]
    child = _folder(client, h, "C", parent).json()["id"]
    r = client.patch(f"{FILES}/{child}", json={"name": "C2"}, headers=h)
    assert r.json()["parent_id"] == parent


def test_explicit_null_parent_moves_to_root(client, auth_headers):
    h = auth_headers()
    parent = _folder(client, h, "P").json()["id"]
    child = _folder(client, h, "C", parent).json()["id"]
    r = client.patch(f"{FILES}/{child}", json={"parent_id": None}, headers=h)
    assert r.json()["parent_id"] is None


def test_cannot_move_folder_into_itself(client, auth_headers):
    h = auth_headers()
    folder = _folder(client, h, "F").json()["id"]
    assert client.patch(f"{FILES}/{folder}", json={"parent_id": folder}, headers=h).status_code == 400


def test_cannot_move_folder_into_own_descendant(client, auth_headers):
    """Would orphan the subtree: still stored, unreachable by listing."""
    h = auth_headers()
    top = _folder(client, h, "top").json()["id"]
    mid = _folder(client, h, "mid", top).json()["id"]
    deep = _folder(client, h, "deep", mid).json()["id"]
    assert client.patch(f"{FILES}/{top}", json={"parent_id": deep}, headers=h).status_code == 400


# --- delete -------------------------------------------------------------

def test_delete_file_removes_object_and_row(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _upload(client, h).json()["item"]["id"]
    key = fake_item_repo._items[item_id].s3_key

    assert client.delete(f"{FILES}/{item_id}", headers=h).status_code == 204
    assert key in fake_storage.deleted
    assert client.get(FILES, headers=h).json() == []


def test_delete_folder_removes_whole_subtree(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    top = _folder(client, h, "top").json()["id"]
    mid = _folder(client, h, "mid", top).json()["id"]
    f1 = _upload(client, h, "a.txt", top).json()["item"]["id"]
    f2 = _upload(client, h, "b.txt", mid).json()["item"]["id"]
    keys = [fake_item_repo._items[i].s3_key for i in (f1, f2)]

    assert client.delete(f"{FILES}/{top}", headers=h).status_code == 204
    assert all(k in fake_storage.deleted for k in keys)
    assert client.get(FILES, headers=h).json() == []


# --- cross-user isolation ----------------------------------------------

def test_user_cannot_list_another_users_items(client, auth_headers):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    _folder(client, a, "A-secret")
    assert client.get(FILES, headers=b).json() == []


def test_user_cannot_read_another_users_item(client, auth_headers):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    victim = _folder(client, a, "A-secret").json()["id"]
    # 404 rather than 403: a 403 would confirm the id exists.
    assert client.get(FILES, params={"parent_id": victim}, headers=b).status_code == 404
    assert client.patch(f"{FILES}/{victim}", json={"name": "pwned"}, headers=b).status_code == 404
    assert client.delete(f"{FILES}/{victim}", headers=b).status_code == 404


def test_user_cannot_download_another_users_file(client, auth_headers, fake_storage,
                                                 fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    item_id = _upload(client, a, "private.pdf").json()["item"]["id"]
    fake_storage.uploaded[fake_item_repo._items[item_id].s3_key] = 5
    client.post(f"{FILES}/{item_id}/complete", headers=a)

    assert client.get(f"{FILES}/{item_id}/download-url", headers=b).status_code == 404


def test_user_cannot_move_own_item_into_another_users_folder(client, auth_headers):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    a_folder = _folder(client, a, "A-folder").json()["id"]
    b_item = _folder(client, b, "B-folder").json()["id"]
    assert client.patch(f"{FILES}/{b_item}", json={"parent_id": a_folder},
                        headers=b).status_code == 404
