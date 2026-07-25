"""Pagination, the global photo library, search, and bulk operations."""

from datetime import datetime, timedelta, timezone

from app.storage.keys import thumbnail_key

FILES = "/api/v1/files"


def _folder(client, h, name, parent=None):
    return client.post(f"{FILES}/folders", json={"name": name, "parent_id": parent},
                       headers=h).json()["id"]


def _ready_file(client, h, storage, repo, name, parent=None, ctype="text/plain", size=100):
    """Create a file and mark it uploaded, as the browser flow would."""
    item_id = client.post(
        f"{FILES}/upload-url",
        json={"name": name, "parent_id": parent, "content_type": ctype},
        headers=h,
    ).json()["item"]["id"]
    storage.uploaded[repo._items[item_id].s3_key] = size
    client.post(f"{FILES}/{item_id}/complete", headers=h)
    return item_id


def _ready_image_with_hash(client, h, storage, repo, name, phash, parent=None):
    """A ready image whose thumbnail already carries a perceptual hash —
    what the thumbnailer Lambda would have written."""
    item_id = _ready_file(client, h, storage, repo, name, parent, "image/jpeg")
    thumb_key = thumbnail_key(repo._items[item_id].s3_key)
    storage.uploaded[thumb_key] = 1
    storage.object_metadata[thumb_key] = {"phash": phash}
    return item_id


def _ready_image_with_gps(client, h, storage, repo, name, lat, lon, parent=None):
    """A ready image whose thumbnail carries GPS metadata, as the
    thumbnailer Lambda would write when the photo has EXIF GPS tags."""
    item_id = _ready_file(client, h, storage, repo, name, parent, "image/jpeg")
    thumb_key = thumbnail_key(repo._items[item_id].s3_key)
    storage.uploaded[thumb_key] = 1
    storage.object_metadata[thumb_key] = {"phash": "0" * 16, "lat": f"{lat:.6f}", "lon": f"{lon:.6f}"}
    return item_id


# --- pagination ---------------------------------------------------------

def test_listing_is_paginated(client, auth_headers):
    h = auth_headers()
    for i in range(12):
        _folder(client, h, f"folder-{i:02d}")

    first = client.get(FILES, params={"limit": 5}, headers=h).json()
    assert len(first["items"]) == 5
    assert first["total"] == 12
    assert first["offset"] == 0

    second = client.get(FILES, params={"limit": 5, "offset": 5}, headers=h).json()
    assert len(second["items"]) == 5
    # Pages must not overlap, or an infinite scroll shows duplicates.
    assert not {i["id"] for i in first["items"]} & {i["id"] for i in second["items"]}

    last = client.get(FILES, params={"limit": 5, "offset": 10}, headers=h).json()
    assert len(last["items"]) == 2


def test_page_size_is_capped(client, auth_headers):
    """A caller cannot ask for an unbounded page."""
    h = auth_headers()
    assert client.get(FILES, params={"limit": 5000}, headers=h).status_code == 422


def test_sorting_options(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "b.txt", size=300)
    _ready_file(client, h, fake_storage, fake_item_repo, "a.txt", size=100)
    _ready_file(client, h, fake_storage, fake_item_repo, "c.txt", size=200)

    by_name = client.get(FILES, params={"sort": "name"}, headers=h).json()["items"]
    assert [i["name"] for i in by_name] == ["a.txt", "b.txt", "c.txt"]

    by_size = client.get(FILES, params={"sort": "size"}, headers=h).json()["items"]
    assert [i["size"] for i in by_size] == [300, 200, 100]


def test_unknown_sort_falls_back_rather_than_erroring(client, auth_headers):
    h = auth_headers()
    _folder(client, h, "x")
    r = client.get(FILES, params={"sort": "'; drop--"}, headers=h)
    assert r.status_code == 200


# --- global photo library ----------------------------------------------

def test_photos_span_every_folder(client, auth_headers, fake_storage, fake_item_repo):
    """A photo library is organised by time, not by where files sit."""
    h = auth_headers()
    album = _folder(client, h, "Album")
    nested = _folder(client, h, "Nested", album)
    _ready_file(client, h, fake_storage, fake_item_repo, "root.jpg", None, "image/jpeg")
    _ready_file(client, h, fake_storage, fake_item_repo, "album.jpg", album, "image/jpeg")
    _ready_file(client, h, fake_storage, fake_item_repo, "deep.jpg", nested, "image/jpeg")

    body = client.get(f"{FILES}/photos", headers=h).json()
    assert body["total"] == 3
    assert {i["name"] for i in body["items"]} == {"root.jpg", "album.jpg", "deep.jpg"}


def test_photos_exclude_non_images_and_pending_uploads(client, auth_headers, fake_storage,
                                                       fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "doc.pdf", None, "application/pdf")
    _ready_file(client, h, fake_storage, fake_item_repo, "shown.jpg", None, "image/jpeg")
    # Requested but never uploaded — has no bytes behind it.
    client.post(f"{FILES}/upload-url",
                json={"name": "pending.jpg", "parent_id": None, "content_type": "image/jpeg"},
                headers=h)

    body = client.get(f"{FILES}/photos", headers=h).json()
    assert [i["name"] for i in body["items"]] == ["shown.jpg"]


def test_photos_are_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    _ready_file(client, a, fake_storage, fake_item_repo, "mine.jpg", None, "image/jpeg")
    assert client.get(f"{FILES}/photos", headers=b).json()["total"] == 0


# --- global video library ------------------------------------------------

def test_videos_span_every_folder(client, auth_headers, fake_storage, fake_item_repo):
    """Mirrors the photo library: organised by time, not by folder."""
    h = auth_headers()
    album = _folder(client, h, "Album")
    nested = _folder(client, h, "Nested", album)
    _ready_file(client, h, fake_storage, fake_item_repo, "root.mp4", None, "video/mp4")
    _ready_file(client, h, fake_storage, fake_item_repo, "album.mp4", album, "video/mp4")
    _ready_file(client, h, fake_storage, fake_item_repo, "deep.mp4", nested, "video/mp4")

    body = client.get(f"{FILES}/videos", headers=h).json()
    assert body["total"] == 3
    assert {i["name"] for i in body["items"]} == {"root.mp4", "album.mp4", "deep.mp4"}


def test_videos_exclude_non_videos_and_pending_uploads(client, auth_headers, fake_storage,
                                                       fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "doc.pdf", None, "application/pdf")
    _ready_file(client, h, fake_storage, fake_item_repo, "shown.mp4", None, "video/mp4")
    client.post(f"{FILES}/upload-url",
                json={"name": "pending.mp4", "parent_id": None, "content_type": "video/mp4"},
                headers=h)

    body = client.get(f"{FILES}/videos", headers=h).json()
    assert [i["name"] for i in body["items"]] == ["shown.mp4"]


def test_videos_are_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    _ready_file(client, a, fake_storage, fake_item_repo, "mine.mp4", None, "video/mp4")
    assert client.get(f"{FILES}/videos", headers=b).json()["total"] == 0


# --- batch thumbnail signing -------------------------------------------

def test_thumbnail_urls_signs_a_batch_in_one_call(client, auth_headers, fake_storage,
                                                  fake_item_repo):
    """One request per grid, not one per tile."""
    h = auth_headers()
    ids = [
        _ready_file(client, h, fake_storage, fake_item_repo, f"p{i}.jpg", None, "image/jpeg")
        for i in range(5)
    ]
    r = client.post(f"{FILES}/thumbnail-urls", json={"item_ids": ids}, headers=h)
    assert r.status_code == 200
    assert {u["item_id"] for u in r.json()["urls"]} == set(ids)


def test_thumbnail_batch_skips_other_users_ids(client, auth_headers, fake_storage,
                                               fake_item_repo):
    """A stale or forged id must not leak a URL, nor fail the whole batch."""
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    theirs = _ready_file(client, a, fake_storage, fake_item_repo, "theirs.jpg", None, "image/jpeg")
    mine = _ready_file(client, b, fake_storage, fake_item_repo, "mine.jpg", None, "image/jpeg")

    urls = client.post(f"{FILES}/thumbnail-urls", json={"item_ids": [mine, theirs]},
                       headers=b).json()["urls"]
    assert [u["item_id"] for u in urls] == [mine]


def test_thumbnail_batch_is_bounded(client, auth_headers):
    h = auth_headers()
    r = client.post(f"{FILES}/thumbnail-urls",
                    json={"item_ids": [f"{i:024x}" for i in range(600)]}, headers=h)
    assert r.status_code == 422


# --- search -------------------------------------------------------------

def test_search_crosses_folders(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    deep = _folder(client, h, "Deep")
    _ready_file(client, h, fake_storage, fake_item_repo, "invoice-2024.pdf", deep)
    _ready_file(client, h, fake_storage, fake_item_repo, "notes.txt", None)

    body = client.get(f"{FILES}/search", params={"q": "invoice"}, headers=h).json()
    assert [i["name"] for i in body["items"]] == ["invoice-2024.pdf"]


def test_search_is_case_insensitive(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "Report.PDF", None)
    assert client.get(f"{FILES}/search", params={"q": "report"}, headers=h).json()["total"] == 1


def test_search_treats_regex_characters_literally(client, auth_headers, fake_storage,
                                                  fake_item_repo):
    """An unescaped '.*' would match everything the user owns."""
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "budget.txt", None)
    _ready_file(client, h, fake_storage, fake_item_repo, "notes.txt", None)
    assert client.get(f"{FILES}/search", params={"q": ".*"}, headers=h).json()["total"] == 0


def test_search_is_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    _ready_file(client, a, fake_storage, fake_item_repo, "secret.txt", None)
    assert client.get(f"{FILES}/search", params={"q": "secret"}, headers=b).json()["total"] == 0


def test_search_ignores_trashed_items(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item = _ready_file(client, h, fake_storage, fake_item_repo, "gone.txt", None)
    client.delete(f"{FILES}/{item}", headers=h)
    assert client.get(f"{FILES}/search", params={"q": "gone"}, headers=h).json()["total"] == 0


# --- search filters -----------------------------------------------------

def test_search_filters_by_type(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    _folder(client, h, "report-folder")
    _ready_file(client, h, fake_storage, fake_item_repo, "report.txt", None)

    files_only = client.get(
        f"{FILES}/search", params={"q": "report", "type": "file"}, headers=h
    ).json()
    assert [i["name"] for i in files_only["items"]] == ["report.txt"]

    folders_only = client.get(
        f"{FILES}/search", params={"q": "report", "type": "folder"}, headers=h
    ).json()
    assert [i["name"] for i in folders_only["items"]] == ["report-folder"]


def test_search_filters_by_category(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "trip.jpg", None, "image/jpeg")
    _ready_file(client, h, fake_storage, fake_item_repo, "trip.mp4", None, "video/mp4")

    body = client.get(
        f"{FILES}/search", params={"q": "trip", "category": "images"}, headers=h
    ).json()
    assert [i["name"] for i in body["items"]] == ["trip.jpg"]


def test_search_filters_by_size_range(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "small-log.txt", None, size=10)
    _ready_file(client, h, fake_storage, fake_item_repo, "big-log.txt", None, size=10_000)

    body = client.get(
        f"{FILES}/search", params={"q": "log", "min_size": 1000}, headers=h
    ).json()
    assert [i["name"] for i in body["items"]] == ["big-log.txt"]

    body = client.get(
        f"{FILES}/search", params={"q": "log", "max_size": 100}, headers=h
    ).json()
    assert [i["name"] for i in body["items"]] == ["small-log.txt"]


def test_search_filters_by_date_range(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item = _ready_file(client, h, fake_storage, fake_item_repo, "dated-note.txt", None)

    far_future = datetime.now(timezone.utc) + timedelta(days=365)
    body = client.get(
        f"{FILES}/search",
        params={"q": "dated", "updated_after": far_future.isoformat()},
        headers=h,
    ).json()
    assert body["total"] == 0

    far_past = datetime.now(timezone.utc) - timedelta(days=365)
    body = client.get(
        f"{FILES}/search",
        params={"q": "dated", "updated_after": far_past.isoformat()},
        headers=h,
    ).json()
    assert [i["id"] for i in body["items"]] == [item]


def test_search_filters_combine_with_and_semantics(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "photo-small.jpg", None,
               "image/jpeg", size=10)
    _ready_file(client, h, fake_storage, fake_item_repo, "photo-big.jpg", None,
               "image/jpeg", size=10_000)

    body = client.get(
        f"{FILES}/search",
        params={"q": "photo", "category": "images", "min_size": 1000},
        headers=h,
    ).json()
    assert [i["name"] for i in body["items"]] == ["photo-big.jpg"]


# --- bulk move ----------------------------------------------------------

def test_bulk_move(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    dest = _folder(client, h, "Dest")
    ids = [
        _ready_file(client, h, fake_storage, fake_item_repo, f"f{i}.txt", None)
        for i in range(3)
    ]
    r = client.post(f"{FILES}/move", json={"item_ids": ids, "parent_id": dest}, headers=h)
    assert r.json()["affected"] == 3
    moved = client.get(FILES, params={"parent_id": dest}, headers=h).json()
    assert moved["total"] == 3


def test_bulk_move_skips_a_folder_that_would_cycle(client, auth_headers):
    """One invalid move must not undo the valid ones in the batch."""
    h = auth_headers()
    top = _folder(client, h, "top")
    inner = _folder(client, h, "inner", top)
    other = _folder(client, h, "other")

    r = client.post(f"{FILES}/move", json={"item_ids": [other, top], "parent_id": inner},
                    headers=h)
    assert r.json()["affected"] == 1
    assert [i["name"] for i in client.get(FILES, params={"parent_id": inner},
                                          headers=h).json()["items"]] == ["other"]


def test_bulk_trash_and_restore(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    ids = [
        _ready_file(client, h, fake_storage, fake_item_repo, f"f{i}.txt", None)
        for i in range(3)
    ]
    assert client.post(f"{FILES}/trash", json={"item_ids": ids},
                       headers=h).json()["affected"] == 3
    assert client.get(FILES, headers=h).json()["total"] == 0

    assert client.post(f"{FILES}/restore", json={"item_ids": ids},
                       headers=h).json()["affected"] == 3
    assert client.get(FILES, headers=h).json()["total"] == 3


def test_bulk_operations_ignore_other_users_items(client, auth_headers, fake_storage,
                                                  fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    theirs = _ready_file(client, a, fake_storage, fake_item_repo, "theirs.txt", None)

    assert client.post(f"{FILES}/trash", json={"item_ids": [theirs]},
                       headers=b).json()["affected"] == 0
    assert client.get(FILES, headers=a).json()["total"] == 1


# --- duplicate names ----------------------------------------------------

def test_duplicate_upload_names_are_disambiguated(client, auth_headers):
    """Two files called the same thing would be indistinguishable in the UI."""
    h = auth_headers()
    first = client.post(f"{FILES}/upload-url", json={"name": "photo.jpg", "parent_id": None},
                        headers=h).json()["item"]["name"]
    second = client.post(f"{FILES}/upload-url", json={"name": "photo.jpg", "parent_id": None},
                         headers=h).json()["item"]["name"]
    assert first == "photo.jpg"
    assert second == "photo (2).jpg"


def test_duplicate_folder_names_are_disambiguated(client, auth_headers):
    h = auth_headers()
    client.post(f"{FILES}/folders", json={"name": "Docs"}, headers=h)
    r = client.post(f"{FILES}/folders", json={"name": "Docs"}, headers=h)
    assert r.json()["name"] == "Docs (2)"


def test_same_name_in_different_folders_is_fine(client, auth_headers):
    h = auth_headers()
    other = _folder(client, h, "Other")
    a = client.post(f"{FILES}/folders", json={"name": "Docs"}, headers=h).json()["name"]
    b = client.post(f"{FILES}/folders", json={"name": "Docs", "parent_id": other},
                    headers=h).json()["name"]
    assert a == b == "Docs"


# --- recent + usage detail ---------------------------------------------

def test_recent_lists_files_newest_first(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "old.txt", None)
    _ready_file(client, h, fake_storage, fake_item_repo, "new.txt", None)
    names = [i["name"] for i in client.get(f"{FILES}/recent", headers=h).json()]
    assert names[0] == "new.txt"


def test_usage_detail_breaks_down_by_category(client, auth_headers, fake_storage,
                                              fake_item_repo):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "a.jpg", None, "image/jpeg", 1000)
    _ready_file(client, h, fake_storage, fake_item_repo, "b.pdf", None, "application/pdf", 500)

    body = client.get(f"{FILES}/usage/detail", headers=h).json()
    assert body["bytes_stored"] == 1500
    categories = {c["category"]: c["bytes_stored"] for c in body["by_category"]}
    assert categories["images"] == 1000
    assert categories["documents"] == 500


def test_usage_detail_reports_trash_separately(client, auth_headers, fake_storage,
                                               fake_item_repo):
    """Trash still occupies S3, so it is surfaced rather than hidden."""
    h = auth_headers()
    item = _ready_file(client, h, fake_storage, fake_item_repo, "a.txt", None, size=800)
    client.delete(f"{FILES}/{item}", headers=h)

    body = client.get(f"{FILES}/usage/detail", headers=h).json()
    assert body["bytes_stored"] == 0
    assert body["trashed_count"] == 1
    assert body["trashed_bytes"] == 800


# --- preview ------------------------------------------------------------

def test_preview_url_has_no_attachment_disposition(client, auth_headers, fake_storage,
                                                   fake_item_repo):
    """Preview renders in place; download forces a save dialog."""
    h = auth_headers()
    item = _ready_file(client, h, fake_storage, fake_item_repo, "a.jpg", None, "image/jpeg")

    preview = client.get(f"{FILES}/{item}/preview-url", headers=h).json()["download_url"]
    download = client.get(f"{FILES}/{item}/download-url", headers=h).json()["download_url"]
    assert "filename" not in preview
    assert "filename" in download


def test_preview_requires_a_completed_upload(client, auth_headers):
    h = auth_headers()
    item = client.post(f"{FILES}/upload-url", json={"name": "a.jpg", "parent_id": None},
                       headers=h).json()["item"]["id"]
    assert client.get(f"{FILES}/{item}/preview-url", headers=h).status_code == 400


def test_preview_is_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    item = _ready_file(client, a, fake_storage, fake_item_repo, "private.jpg", None, "image/jpeg")
    assert client.get(f"{FILES}/{item}/preview-url", headers=b).status_code == 404


# --- on this day ----------------------------------------------------------

def _set_taken_at(repo, item_id, taken_at):
    repo._items[item_id] = repo._items[item_id].model_copy(update={"taken_at": taken_at})


def test_on_this_day_matches_same_month_and_day_in_a_past_year(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    today = datetime.now(timezone.utc)
    item = _ready_file(client, h, fake_storage, fake_item_repo, "then.jpg", None, "image/jpeg")
    _set_taken_at(fake_item_repo, item, today.replace(year=today.year - 3))

    body = client.get(f"{FILES}/on-this-day", headers=h).json()
    assert [i["id"] for i in body] == [item]


def test_on_this_day_excludes_this_year_and_other_days(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    today = datetime.now(timezone.utc)
    this_year = _ready_file(client, h, fake_storage, fake_item_repo, "now.jpg", None, "image/jpeg")
    _set_taken_at(fake_item_repo, this_year, today)

    # A different calendar day, one year ago — must not match even though
    # the year condition alone would pass.
    other_day = _ready_file(client, h, fake_storage, fake_item_repo, "other.jpg", None, "image/jpeg")
    _set_taken_at(fake_item_repo, other_day, today.replace(year=today.year - 1) - timedelta(days=10))

    body = client.get(f"{FILES}/on-this-day", headers=h).json()
    assert body == []


def test_on_this_day_excludes_non_images_and_pending_uploads(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    today = datetime.now(timezone.utc)
    doc = _ready_file(client, h, fake_storage, fake_item_repo, "then.pdf", None, "application/pdf")
    _set_taken_at(fake_item_repo, doc, today.replace(year=today.year - 1))

    pending_id = client.post(
        f"{FILES}/upload-url",
        json={"name": "pending.jpg", "parent_id": None, "content_type": "image/jpeg"},
        headers=h,
    ).json()["item"]["id"]
    _set_taken_at(fake_item_repo, pending_id, today.replace(year=today.year - 1))

    body = client.get(f"{FILES}/on-this-day", headers=h).json()
    assert body == []


def test_on_this_day_is_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    today = datetime.now(timezone.utc)
    item = _ready_file(client, a, fake_storage, fake_item_repo, "mine.jpg", None, "image/jpeg")
    _set_taken_at(fake_item_repo, item, today.replace(year=today.year - 1))

    assert client.get(f"{FILES}/on-this-day", headers=b).json() == []


# --- starred items ----------------------------------------------------------

def test_star_and_unstar_a_file(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item = _ready_file(client, h, fake_storage, fake_item_repo, "a.txt")

    star = client.post(f"{FILES}/star", json={"item_ids": [item]}, headers=h)
    assert star.status_code == 200
    assert star.json()["affected"] == 1
    assert client.get(FILES, headers=h).json()["items"][0]["starred"] is True

    unstar = client.post(f"{FILES}/unstar", json={"item_ids": [item]}, headers=h)
    assert unstar.status_code == 200
    assert unstar.json()["affected"] == 1
    assert client.get(FILES, headers=h).json()["items"][0]["starred"] is False


def test_starring_a_folder_works_too(client, auth_headers):
    h = auth_headers()
    folder = _folder(client, h, "Album")
    resp = client.post(f"{FILES}/star", json={"item_ids": [folder]}, headers=h)
    assert resp.json()["affected"] == 1


def test_starred_view_spans_files_and_folders_across_the_tree(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    album = _folder(client, h, "Album")
    nested_file = _ready_file(client, h, fake_storage, fake_item_repo, "deep.txt", album)
    root_file = _ready_file(client, h, fake_storage, fake_item_repo, "root.txt")
    unstarred = _ready_file(client, h, fake_storage, fake_item_repo, "plain.txt")

    client.post(f"{FILES}/star", json={"item_ids": [album, nested_file, root_file]}, headers=h)

    body = client.get(f"{FILES}/starred", headers=h).json()
    assert body["total"] == 3
    starred_ids = {i["id"] for i in body["items"]}
    assert starred_ids == {album, nested_file, root_file}
    assert unstarred not in starred_ids


def test_starred_items_are_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    item = _ready_file(client, a, fake_storage, fake_item_repo, "mine.txt")
    client.post(f"{FILES}/star", json={"item_ids": [item]}, headers=a)
    assert client.get(f"{FILES}/starred", headers=b).json()["total"] == 0


def test_star_skips_other_users_items_without_failing_the_batch(
    client, auth_headers, fake_storage, fake_item_repo
):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    theirs = _ready_file(client, a, fake_storage, fake_item_repo, "theirs.txt")
    mine = _ready_file(client, b, fake_storage, fake_item_repo, "mine.txt")

    resp = client.post(f"{FILES}/star", json={"item_ids": [mine, theirs]}, headers=b)
    assert resp.json()["affected"] == 1
    assert client.get(f"{FILES}/starred", headers=a).json()["total"] == 0


# --- folder / item color -----------------------------------------------------

def test_set_and_clear_item_color(client, auth_headers):
    h = auth_headers()
    folder = _folder(client, h, "Album")

    resp = client.patch(f"{FILES}/{folder}", json={"color": "blue"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["color"] == "blue"

    cleared = client.patch(f"{FILES}/{folder}", json={"color": None}, headers=h)
    assert cleared.json()["color"] is None


def test_color_not_sent_leaves_existing_value_untouched(client, auth_headers):
    h = auth_headers()
    folder = _folder(client, h, "Album")
    client.patch(f"{FILES}/{folder}", json={"color": "green"}, headers=h)

    renamed = client.patch(f"{FILES}/{folder}", json={"name": "Renamed"}, headers=h)
    assert renamed.json()["color"] == "green"
    assert renamed.json()["name"] == "Renamed"


def test_color_rejects_values_outside_the_fixed_palette(client, auth_headers):
    h = auth_headers()
    folder = _folder(client, h, "Album")
    resp = client.patch(
        f"{FILES}/{folder}", json={"color": "javascript:alert(1)"}, headers=h
    )
    assert resp.status_code == 422


# --- duplicate detection / photo stacks --------------------------------

def test_duplicates_groups_near_identical_hashes(client, auth_headers, fake_storage,
                                                 fake_item_repo):
    h = auth_headers()
    _ready_image_with_hash(client, h, fake_storage, fake_item_repo, "a.jpg", "0" * 16)
    # 1 bit different — well within the duplicate threshold.
    _ready_image_with_hash(client, h, fake_storage, fake_item_repo, "b.jpg", "1" + "0" * 15)
    _ready_image_with_hash(client, h, fake_storage, fake_item_repo, "c.jpg", "f" * 16)

    body = client.get(f"{FILES}/duplicates", headers=h).json()
    assert len(body["groups"]) == 1
    names = {i["name"] for i in body["groups"][0]["items"]}
    assert names == {"a.jpg", "b.jpg"}


def test_duplicates_ignores_images_without_a_hash_yet(client, auth_headers, fake_storage,
                                                      fake_item_repo):
    h = auth_headers()
    _ready_image_with_hash(client, h, fake_storage, fake_item_repo, "a.jpg", "0" * 16)
    # Uploaded but the thumbnailer hasn't run (or never will) — no metadata.
    _ready_file(client, h, fake_storage, fake_item_repo, "b.jpg", None, "image/jpeg")

    body = client.get(f"{FILES}/duplicates", headers=h).json()
    assert body["groups"] == []


def test_duplicates_are_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    _ready_image_with_hash(client, a, fake_storage, fake_item_repo, "a1.jpg", "0" * 16)
    _ready_image_with_hash(client, a, fake_storage, fake_item_repo, "a2.jpg", "0" * 16)

    assert client.get(f"{FILES}/duplicates", headers=b).json()["groups"] == []


def test_photo_stacks_requires_both_similarity_and_time_proximity(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    now = datetime.now(timezone.utc)

    burst_a = _ready_image_with_hash(client, h, fake_storage, fake_item_repo, "burst-a.jpg", "0" * 16)
    burst_b = _ready_image_with_hash(
        client, h, fake_storage, fake_item_repo, "burst-b.jpg", "3" + "0" * 15  # 2 bits off
    )
    _set_taken_at(fake_item_repo, burst_a, now)
    _set_taken_at(fake_item_repo, burst_b, now + timedelta(seconds=5))

    # Similar hash, but taken a year apart — not a stack.
    far_apart = _ready_image_with_hash(
        client, h, fake_storage, fake_item_repo, "far-apart.jpg", "1" + "0" * 15
    )
    _set_taken_at(fake_item_repo, far_apart, now - timedelta(days=365))

    body = client.get(f"{FILES}/photo-stacks", headers=h).json()
    assert len(body["groups"]) == 1
    names = {i["name"] for i in body["groups"][0]["items"]}
    assert names == {"burst-a.jpg", "burst-b.jpg"}


def test_photo_stacks_are_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    now = datetime.now(timezone.utc)
    item1 = _ready_image_with_hash(client, a, fake_storage, fake_item_repo, "a1.jpg", "0" * 16)
    item2 = _ready_image_with_hash(client, a, fake_storage, fake_item_repo, "a2.jpg", "0" * 16)
    _set_taken_at(fake_item_repo, item1, now)
    _set_taken_at(fake_item_repo, item2, now)

    assert client.get(f"{FILES}/photo-stacks", headers=b).json()["groups"] == []


# --- map view -------------------------------------------------------------

def test_map_points_returns_geotagged_photos(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    _ready_image_with_gps(client, h, fake_storage, fake_item_repo, "geo.jpg", 12.9716, 77.5946)
    # No GPS EXIF — the common case — must be silently omitted.
    _ready_image_with_hash(client, h, fake_storage, fake_item_repo, "no-gps.jpg", "0" * 16)

    body = client.get(f"{FILES}/map-points", headers=h).json()
    assert len(body["photos"]) == 1
    point = body["photos"][0]
    assert point["item"]["name"] == "geo.jpg"
    assert point["lat"] == 12.9716
    assert point["lon"] == 77.5946


def test_map_points_ignores_images_without_a_thumbnail_yet(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    _ready_file(client, h, fake_storage, fake_item_repo, "pending.jpg", None, "image/jpeg")

    assert client.get(f"{FILES}/map-points", headers=h).json()["photos"] == []


# --- in-browser photo editing (in-place replace) ---------------------------

def test_replace_upload_url_then_complete_updates_size_and_content_type(
    client, auth_headers, fake_storage, fake_item_repo
):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "photo.png", None, "image/png", size=500)

    resp = client.post(f"{FILES}/{item_id}/replace-upload-url", headers=h)
    assert resp.status_code == 200
    assert resp.json()["upload_url"]

    # Simulate the browser PUTting the edited (always re-encoded JPEG) bytes.
    key = fake_item_repo._items[item_id].s3_key
    fake_storage.uploaded[key] = 999

    body = client.post(f"{FILES}/{item_id}/complete-replace", headers=h).json()
    assert body["size"] == 999
    assert body["content_type"] == "image/jpeg"


def test_replace_upload_url_rejects_non_images(client, auth_headers, fake_storage, fake_item_repo):
    h = auth_headers()
    item_id = _ready_file(client, h, fake_storage, fake_item_repo, "notes.txt", None, "text/plain")

    resp = client.post(f"{FILES}/{item_id}/replace-upload-url", headers=h)
    assert resp.status_code == 400


def test_replace_upload_url_rejects_folders(client, auth_headers):
    h = auth_headers()
    folder_id = _folder(client, h, "a-folder")

    resp = client.post(f"{FILES}/{folder_id}/replace-upload-url", headers=h)
    assert resp.status_code == 400


def test_map_points_are_isolated_per_user(client, auth_headers, fake_storage, fake_item_repo):
    a = auth_headers("a@example.com")
    b = auth_headers("b@example.com")
    _ready_image_with_gps(client, a, fake_storage, fake_item_repo, "a.jpg", 1.0, 2.0)

    assert client.get(f"{FILES}/map-points", headers=b).json()["photos"] == []
