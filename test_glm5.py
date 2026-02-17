import google.auth
import google.auth.transport.requests
import requests
import json

def test_glm5():
    project_id = "notional-analog-486611-t3"
    region = "global"
    endpoint_url = f"https://aiplatform.googleapis.com/v1/projects/{project_id}/locations/{region}/endpoints/openapi/chat/completions"
    
    print("Getting credentials from service account file...")
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests

        key_path = "notional-analog-486611-t3-459586a9ad37.json"
        credentials = service_account.Credentials.from_service_account_file(
            key_path,
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        token = credentials.token
        print("Credentials obtained.")
    except Exception as e:
        print(f"Error getting credentials: {e}")
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "zai-org/glm-5-maas",
        "stream": False,
        "messages": [
            {"role": "user", "content": "Hello, are you functional?"}
        ]
    }

    print(f"Sending request to {endpoint_url}...")
    try:
        response = requests.post(endpoint_url, headers=headers, json=payload)
        print(f"Status Code: {response.status_code}")
        print("Response Body:")
        print(json.dumps(response.json(), indent=2))
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_glm5()
