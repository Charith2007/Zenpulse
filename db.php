<?php
require __DIR__ . '/config.php';

session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'lifetime' => 0]);
session_start();

function json_out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code): void {
    json_out(['status' => 'error', 'error' => $msg, 'message' => $msg], $code);
}

/** Connects, creates the database/tables on first run, and makes sure the demo student exists. */
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];

    $boot = new PDO('mysql:host=' . DB_HOST . ';charset=utf8mb4', DB_USER, DB_PASS, $opts);
    $boot->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4');

    $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, $opts);
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        department VARCHAR(150) NOT NULL DEFAULT 'Computer Science & Engineering',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS study_sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        subject VARCHAR(150) NOT NULL,
        duration_min SMALLINT UNSIGNED NOT NULL,
        session_type ENUM('focus','break') NOT NULL,
        session_time DATETIME(3) NOT NULL,
        notes VARCHAR(500) NOT NULL DEFAULT '',
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        INDEX idx_user_time (user_id, session_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $demo = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
    $demo->execute(['student@woxsen.edu.in']);
    if (!$demo->fetch()) {
        $pdo->prepare('INSERT INTO users (name, email, password_hash, department) VALUES (?,?,?,?)')
            ->execute(['Sai Charith', 'student@woxsen.edu.in', password_hash('password123', PASSWORD_DEFAULT), 'Computer Science & Engineering']);
    }
    return $pdo;
}

function current_user_id(): ?int {
    return isset($_SESSION['userId']) ? (int)$_SESSION['userId'] : null;
}

function user_json(array $u): array {
    return ['userId' => (int)$u['user_id'], 'name' => $u['name'], 'email' => $u['email'], 'department' => $u['department']];
}
