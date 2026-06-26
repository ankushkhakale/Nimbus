from fastapi import FastAPI
from .api import health

app = FastAPI(title="Nimbus API")

app.include_router(health.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Nimbus API"}
