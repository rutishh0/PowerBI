
import unittest
import base64
from server import app

class TestFileUpload(unittest.TestCase):
    def setUp(self):
        app.testing = True
        app.secret_key = 'test_secret'
        self.client = app.test_client()

    def login(self):
        with self.client.session_transaction() as sess:
            sess['authenticated'] = True

    def test_upload_file(self):
        self.login()
        # Create a dummy base64 file
        dummy_content = b"Hello World PDF Content"
        b64_data = "data:text/plain;base64," + base64.b64encode(dummy_content).decode('utf-8')
        
        payload = {
            "files": [
                {"name": "test_upload_doc.txt", "data": b64_data}
            ]
        }
        
        response = self.client.post('/api/files/upload', json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertIn("Successfully uploaded 1 files", response.json['message'])
        print("\nUpload test passed!")

if __name__ == '__main__':
    unittest.main()
