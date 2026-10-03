# ZenPulse on XAMPP (Apache + PHP + MySQL)

1. Open XAMPP Control Panel -> Start **Apache** and **MySQL**.
2. Copy this whole folder into `C:\xampp\htdocs\` and name it `zenpulse` (so index.html is at `C:\xampp\htdocs\zenpulse\index.html`).
3. Open http://localhost/zenpulse/
4. Sign In -> **Use Demo Student**. Tables are created automatically (check phpMyAdmin -> `zenpulse`).

If your MySQL root has a password, edit `api/config.php`.
Signed-in users are saved in MySQL; guests use LocalStorage. The header shows "● Synced" when the database is connected.
