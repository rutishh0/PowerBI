
import unittest
import base64
from server import app
from db import save_file_to_db, get_all_files

class TestFileDelete(unittest.TestCase):
    def setUp(self):
        app.testing = True
        app.secret_key = 'test_secret'
        self.client = app.test_client()
        
        # Setup: Ensure at least one file exists to delete
        try:
             save_file_to_db("test_delete.txt", b"Can verify delete")
        except:
            pass # might already exist or db error

    def login(self):
        with self.client.session_transaction() as sess:
            sess['authenticated'] = True

    def test_delete_file(self):
        self.login()
        
        # Get list to find an ID to delete
        res = self.client.get('/api/files')
        files = res.json
        if not files:
            self.skipTest("No files found to delete")
            
        file_to_delete = files[0]
        fid = file_to_delete['id']
        
        print(f"Deleting file ID: {fid}")
        
        # Delete it
        response = self.client.delete(f'/api/files/{fid}')
        self.assertEqual(response.status_code, 200)
        self.assertIn("File deleted successfully", response.json['message'])
        
        # Verify it's gone
        res_after = self.client.get('/api/files')
        ids_after = [f['id'] for f in res_after.json]
        self.assertNotIn(fid, ids_after)
        print("Delete verified!")

if __name__ == '__main__':
    unittest.main()
