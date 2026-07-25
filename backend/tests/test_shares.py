"""Share links: creation, expiry/revocation, public resolution, folder
subtree containment, and the "shared with me" view."""

from datetime import datetime, timedelta, timezone

FILES = "/api/v1/files"
SHARES = "/api/v1/shares"


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


# --- creation / management ------------------------------------------------

def test_create_share_returns_a_token_and_item(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "report.txt")

    resp = client.post(SHARES, json={"item_id": item_id}, headers=h)
    assert resp.status_code == 201
    body = resp.json()
    assert body["token"]
    assert body["item"]["id"] == item_id
    assert body["recipient_emails"] == []
    assert body["is_active"] is True


def test_create_share_rejects_an_item_you_do_not_own(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    item_id = _ready_file(client, a, fake_storage, fake_item_repo, "mine.txt")

    resp = client.post(SHARES, json={"item_id": item_id}, headers=b)
    assert resp.status_code == 404


def test_list_my_shares(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "a.txt")
    client.post(SHARES, json={"item_id": item_id}, headers=h)

    body = client.get(SHARES, headers=h).json()
    assert len(body["shares"]) == 1


def test_revoke_share_makes_it_inactive_and_unresolvable(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "a.txt")
    share = client.post(SHARES, json={"item_id": item_id}, headers=h).json()

    resp = client.delete(f"{SHARES}/{share['id']}", headers=h)
    assert resp.status_code == 204

    assert client.get(f"{SHARES}/public/{share['token']}").status_code == 404


def test_revoke_share_is_owner_only(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    item_id = _ready_file(client, a, fake_storage, fake_item_repo, "a.txt")
    share = client.post(SHARES, json={"item_id": item_id}, headers=a).json()

    assert client.delete(f"{SHARES}/{share['id']}", headers=b).status_code == 404


def test_expired_share_is_not_resolvable(client, auth_headers, fake_storage, fake_item_repo, fake_share_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "a.txt")
    share = client.post(
        SHARES, json={"item_id": item_id, "expires_in_days": 1}, headers=h
    ).json()

    # Backdate it directly in the fake store, past a real API call.
    stored = fake_share_repo._shares[share["id"]]
    fake_share_repo._shares[share["id"]] = stored.model_copy(
        update={"expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)}
    )

    assert client.get(f"{SHARES}/public/{share['token']}").status_code == 404


# --- public resolution -----------------------------------------------------

def test_public_link_works_without_auth(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "public.txt")
    share = client.post(SHARES, json={"item_id": item_id}, headers=h).json()

    resp = client.get(f"{SHARES}/public/{share['token']}")
    assert resp.status_code == 200
    assert resp.json()["item"]["name"] == "public.txt"


def test_unknown_token_is_404(client):
    assert client.get(f"{SHARES}/public/not-a-real-token").status_code == 404


def test_restricted_share_rejects_anonymous_and_wrong_user(
    client, auth_headers, fake_storage, fake_item_repo
):
    owner = auth_headers("owner@example.com")
    stranger = auth_headers("stranger@example.com")
    item_id = _ready_file(client, owner, fake_storage, fake_item_repo, "private.txt")
    share = client.post(
        SHARES,
        json={"item_id": item_id, "recipient_emails": ["friend@example.com"]},
        headers=owner,
    ).json()

    assert client.get(f"{SHARES}/public/{share['token']}").status_code == 404
    assert client.get(f"{SHARES}/public/{share['token']}", headers=stranger).status_code == 404


def test_restricted_share_allows_the_named_recipient(
    client, auth_headers, fake_storage, fake_item_repo
):
    owner = auth_headers("owner2@example.com")
    friend = auth_headers("friend2@example.com")
    item_id = _ready_file(client, owner, fake_storage, fake_item_repo, "for-friend.txt")
    share = client.post(
        SHARES,
        json={"item_id": item_id, "recipient_emails": ["friend2@example.com"]},
        headers=owner,
    ).json()

    resp = client.get(f"{SHARES}/public/{share['token']}", headers=friend)
    assert resp.status_code == 200


def test_recipient_email_match_is_case_insensitive(
    client, auth_headers, fake_storage, fake_item_repo
):
    owner = auth_headers("owner3@example.com")
    friend = auth_headers("Friend3@Example.com")
    item_id = _ready_file(client, owner, fake_storage, fake_item_repo, "x.txt")
    share = client.post(
        SHARES,
        json={"item_id": item_id, "recipient_emails": ["FRIEND3@example.com"]},
        headers=owner,
    ).json()

    resp = client.get(f"{SHARES}/public/{share['token']}", headers=friend)
    assert resp.status_code == 200


# --- folder shares / subtree containment ------------------------------------

def test_folder_share_lists_direct_children(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    folder_id = _folder(client, h, "Album")
    _ready_file(client, h, fake_storage, fake_item_repo, "one.txt", parent=folder_id)
    _ready_file(client, h, fake_storage, fake_item_repo, "two.txt", parent=folder_id)

    share = client.post(SHARES, json={"item_id": folder_id}, headers=h).json()
    resp = client.get(f"{SHARES}/public/{share['token']}")
    names = {i["name"] for i in resp.json()["children"]}
    assert names == {"one.txt", "two.txt"}


def test_folder_share_browse_descends_into_subfolders(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    root = _folder(client, h, "Album")
    sub = _folder(client, h, "Subfolder", parent=root)
    _ready_file(client, h, fake_storage, fake_item_repo, "deep.txt", parent=sub)

    share = client.post(SHARES, json={"item_id": root}, headers=h).json()
    resp = client.get(f"{SHARES}/public/{share['token']}/browse", params={"parent_id": sub})
    assert resp.status_code == 200
    assert resp.json()["items"][0]["name"] == "deep.txt"


def test_folder_share_cannot_browse_outside_the_shared_subtree(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    shared_folder = _folder(client, h, "Shared")
    other_folder = _folder(client, h, "NotShared")

    share = client.post(SHARES, json={"item_id": shared_folder}, headers=h).json()
    resp = client.get(
        f"{SHARES}/public/{share['token']}/browse", params={"parent_id": other_folder}
    )
    assert resp.status_code == 404


def test_file_share_download_url_rejects_a_different_item(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    shared_id = _ready_file(client, h, fake_storage, fake_item_repo, "shared.txt")
    other_id = _ready_file(client, h, fake_storage, fake_item_repo, "other.txt")

    share = client.post(SHARES, json={"item_id": shared_id}, headers=h).json()
    resp = client.get(
        f"{SHARES}/public/{share['token']}/download-url", params={"item_id": other_id}
    )
    assert resp.status_code == 404

    ok = client.get(
        f"{SHARES}/public/{share['token']}/download-url", params={"item_id": shared_id}
    )
    assert ok.status_code == 200
    assert ok.json()["download_url"]


# --- shared with me ----------------------------------------------------------

def test_shared_with_me_lists_active_received_shares(
    client, auth_headers, fake_storage, fake_item_repo
):
    owner = auth_headers("owner4@example.com")
    friend = auth_headers("friend4@example.com")
    item_id = _ready_file(client, owner, fake_storage, fake_item_repo, "gift.txt")
    client.post(
        SHARES, json={"item_id": item_id, "recipient_emails": ["friend4@example.com"]}, headers=owner
    )

    body = client.get(f"{SHARES}/received", headers=friend).json()
    assert len(body["shares"]) == 1
    assert body["shares"][0]["item"]["name"] == "gift.txt"
    assert body["shares"][0]["owner_email"] == "owner4@example.com"


def test_shared_with_me_excludes_shares_addressed_to_someone_else(
    client, auth_headers, fake_storage, fake_item_repo
):
    owner = auth_headers("owner5@example.com")
    bystander = auth_headers("bystander@example.com")
    item_id = _ready_file(client, owner, fake_storage, fake_item_repo, "x.txt")
    client.post(
        SHARES, json={"item_id": item_id, "recipient_emails": ["someone-else@example.com"]},
        headers=owner,
    )

    assert client.get(f"{SHARES}/received", headers=bystander).json()["shares"] == []
