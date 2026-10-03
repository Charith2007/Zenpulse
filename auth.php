<?php
// Used by js/auth.js:  GET ?action=me   POST action=login | register | logout
require __DIR__ . '/db.php';

try {
    $action = $_GET['action'] ?? $_POST['action'] ?? '';
    $pdo = db();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $uid = current_user_id();
        if ($uid) {
            $st = $pdo->prepare('SELECT user_id, name, email, department FROM users WHERE user_id = ?');
            $st->execute([$uid]);
            if ($u = $st->fetch()) json_out(['authenticated' => true, 'user' => user_json($u)]);
        }
        json_out(['authenticated' => false]);
    }

    $start = function (array $u) {
        session_regenerate_id(true);
        $_SESSION['userId'] = (int)$u['user_id'];
        json_out(['status' => 'success', 'user' => user_json($u)]);
    };

    if ($action === 'login') {
        $email = strtolower(trim($_POST['email'] ?? ''));
        $st = $pdo->prepare('SELECT * FROM users WHERE email = ?');
        $st->execute([$email]);
        $u = $st->fetch();
        if (!$u || !password_verify(trim($_POST['password'] ?? ''), $u['password_hash'])) fail('Invalid email or password.', 401);
        $start($u);
    }

    if ($action === 'register') {
        $name = trim($_POST['name'] ?? '');
        $email = strtolower(trim($_POST['email'] ?? ''));
        $pass = trim($_POST['password'] ?? '');
        $dept = trim($_POST['department'] ?? '') ?: 'Computer Science & Engineering';
        if (mb_strlen($name) < 2 || mb_strlen($name) > 100) fail('Please enter your full name.', 400);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 150) fail('Enter a valid email address.', 400);
        if (strlen($pass) < 6) fail('Password must be at least 6 characters.', 400);
        try {
            $pdo->prepare('INSERT INTO users (name, email, password_hash, department) VALUES (?,?,?,?)')
                ->execute([$name, $email, password_hash($pass, PASSWORD_DEFAULT), mb_substr($dept, 0, 150)]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('An account with this email already exists.', 409);
            throw $e;
        }
        $start(['user_id' => $pdo->lastInsertId(), 'name' => $name, 'email' => $email, 'department' => $dept]);
    }

    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        json_out(['status' => 'success']);
    }

    fail('Unknown action.', 400);
} catch (Throwable $e) {
    error_log('ZenPulse auth: ' . $e->getMessage());
    fail('Server error. Is MySQL running in XAMPP?', 500);
}
