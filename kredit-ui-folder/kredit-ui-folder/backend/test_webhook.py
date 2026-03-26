import urllib.request
import json
import ssl

# The URL from your app.py
URL = "https://fast-automation.de/webhook-test/0d467980-64c6-45ed-9054-7f911ceaffcc"

data = {
    "test": "manual_test",
    "message": "Testing webhook from server",
    "timestamp": "now"
}

print(f"Testing URL: {URL}")

try:
    # Use unverified context to bypass SSL issues for testing
    context = ssl._create_unverified_context()
    
    req = urllib.request.Request(
        URL,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "FastAPI-Server"},
        method="POST"
    )
    
    with urllib.request.urlopen(req, context=context) as response:
        print(f"Success! Status Code: {response.status}")
        print(f"Response: {response.read().decode('utf-8')}")
except Exception as e:
    print(f"Error triggering webhook: {e}")
