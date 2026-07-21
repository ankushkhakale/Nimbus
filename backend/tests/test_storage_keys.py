import pytest

from app.storage.keys import (
    InvalidObjectKey,
    build_user_key,
    is_owned_by,
    thumbnail_key,
    user_prefix,
)

USER = "64b7f0c2e1a2b3c4d5e6f7a8"
OTHER = "aaaaaaaaaaaaaaaaaaaaaaaa"


def test_user_prefix_shape():
    assert user_prefix(USER) == f"users/{USER}/"


def test_build_key_for_simple_file():
    assert build_user_key(USER, "notes.txt") == f"users/{USER}/notes.txt"


def test_build_key_preserves_nested_folders():
    assert build_user_key(USER, "photos/2024/img.jpg") == f"users/{USER}/photos/2024/img.jpg"


def test_build_key_allows_spaces_and_unicode():
    key = build_user_key(USER, "my docs/résumé final.pdf")
    assert key == f"users/{USER}/my docs/résumé final.pdf"


@pytest.mark.parametrize(
    "evil",
    [
        "../otheruser/secret.txt",
        "photos/../../otheruser/secret.txt",
        "..",
        "a/../../..",
        "/etc/passwd",
        "/absolute.txt",
        "photos//double-slash.jpg",
        "photos/./same-dir.jpg",
        "back\\slash.txt",
        "null\x00byte.txt",
        "control\x01char.txt",
        "",
    ],
)
def test_build_key_rejects_unsafe_paths(evil):
    """Every one of these would otherwise let a user escape their prefix."""
    with pytest.raises(InvalidObjectKey):
        build_user_key(USER, evil)


def test_build_key_rejects_overlong_path():
    with pytest.raises(InvalidObjectKey):
        build_user_key(USER, "a" * 901)


def test_build_key_rejects_non_string():
    with pytest.raises(InvalidObjectKey):
        build_user_key(USER, None)


def test_user_prefix_rejects_user_id_containing_slash():
    with pytest.raises(InvalidObjectKey):
        user_prefix("abc/../def")


def test_is_owned_by_distinguishes_users():
    key = build_user_key(USER, "photos/img.jpg")
    assert is_owned_by(key, USER)
    assert not is_owned_by(key, OTHER)


def test_is_owned_by_rejects_prefix_confusion():
    """users/<id>extra/... must not read as belonging to <id>."""
    assert not is_owned_by(f"users/{USER}extra/file.txt", USER)


# --- thumbnails ---------------------------------------------------------

def test_thumbnail_key_moves_object_outside_the_users_prefix():
    """The prefix split is what prevents the generated thumbnail from
    re-triggering the ObjectCreated notification that produced it."""
    key = build_user_key(USER, "files/abc123")
    thumb = thumbnail_key(key)
    assert thumb == f"thumbnails/{USER}/files/abc123.jpg"
    assert not thumb.startswith("users/")


def test_thumbnail_key_is_deterministic():
    key = build_user_key(USER, "files/abc123")
    assert thumbnail_key(key) == thumbnail_key(key)


def test_thumbnail_key_keeps_users_separated():
    a = thumbnail_key(build_user_key(USER, "files/x"))
    b = thumbnail_key(build_user_key(OTHER, "files/x"))
    assert a != b


def test_thumbnail_key_rejects_keys_outside_the_user_prefix():
    with pytest.raises(InvalidObjectKey):
        thumbnail_key("thumbnails/whatever.jpg")


def test_thumbnail_of_a_thumbnail_is_refused():
    """Guards against a loop if the notification is ever misconfigured."""
    thumb = thumbnail_key(build_user_key(USER, "files/x"))
    with pytest.raises(InvalidObjectKey):
        thumbnail_key(thumb)
