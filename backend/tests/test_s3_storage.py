"""S3 storage tests against a stubbed boto3 client — no network, no cost."""

import pytest
from botocore.exceptions import ClientError

from app.storage.s3_storage import S3ObjectStorage

BUCKET = "test-bucket"


class FakeS3Client:
    def __init__(self, *, head_error: ClientError | None = None, content_length: int = 42):
        self.calls: list[tuple] = []
        self._head_error = head_error
        self._content_length = content_length

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        self.calls.append((operation, Params, ExpiresIn))
        return f"https://example.test/{operation}"

    def delete_object(self, Bucket, Key):
        self.calls.append(("delete_object", Bucket, Key))

    def head_object(self, Bucket, Key):
        if self._head_error:
            raise self._head_error
        return {"ContentLength": self._content_length}


def _client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "x"}}, "HeadObject")


@pytest.fixture
def fake():
    return FakeS3Client()


@pytest.fixture
def storage(fake):
    return S3ObjectStorage(client=fake, bucket=BUCKET, expires_in=900)


def test_upload_url_signs_bucket_key_and_expiry(storage, fake):
    storage.upload_url("users/1/a.txt")
    op, params, expires = fake.calls[0]
    assert op == "put_object"
    assert params == {"Bucket": BUCKET, "Key": "users/1/a.txt"}
    assert expires == 900


def test_upload_url_signs_content_type_when_given(storage, fake):
    """Signing ContentType stops a client uploading a different type."""
    storage.upload_url("users/1/a.png", content_type="image/png")
    _, params, _ = fake.calls[0]
    assert params["ContentType"] == "image/png"


def test_download_url_sets_attachment_filename(storage, fake):
    storage.download_url("users/1/a.txt", filename="report.pdf")
    op, params, _ = fake.calls[0]
    assert op == "get_object"
    assert params["ResponseContentDisposition"] == 'attachment; filename="report.pdf"'


def test_download_url_strips_quotes_from_filename(storage, fake):
    """A quote would otherwise break out of the Content-Disposition header."""
    storage.download_url("users/1/a.txt", filename='ev"il.pdf')
    _, params, _ = fake.calls[0]
    assert params["ResponseContentDisposition"] == 'attachment; filename="evil.pdf"'


def test_delete_passes_bucket_and_key(storage, fake):
    storage.delete("users/1/a.txt")
    assert fake.calls[0] == ("delete_object", BUCKET, "users/1/a.txt")


def test_size_returns_content_length(storage):
    assert storage.size("users/1/a.txt") == 42


def test_size_returns_none_when_missing():
    storage = S3ObjectStorage(client=FakeS3Client(head_error=_client_error("404")), bucket=BUCKET)
    assert storage.size("users/1/missing.txt") is None


def test_exists_reflects_presence(storage):
    assert storage.exists("users/1/a.txt") is True


def test_exists_false_when_missing():
    storage = S3ObjectStorage(client=FakeS3Client(head_error=_client_error("NoSuchKey")), bucket=BUCKET)
    assert storage.exists("users/1/missing.txt") is False


def test_size_reraises_unexpected_errors():
    """AccessDenied must surface, not be silently reported as 'missing'."""
    storage = S3ObjectStorage(
        client=FakeS3Client(head_error=_client_error("AccessDenied")), bucket=BUCKET
    )
    with pytest.raises(ClientError):
        storage.size("users/1/a.txt")
