<?php
// Used by js/data.js.
//  GET  ?action=health | (none) list
//  POST (add) | ?action=delete&id= | ?action=clear | ?action=seed&tzOffset=
// Everything except health needs a signed-in user (401 otherwise; the UI then keeps data in LocalStorage).
require __DIR__ . '/db.php';

function to_db_time(string $iso): string {
    $d = new DateTime($iso);
    $d->setTimezone(new DateTimeZone('UTC'));
    return $d->format('Y-m-d H:i:s.v');
}

function new_id(): string { return 'sess_' . substr(bin2hex(random_bytes(10)), 0, 20); }

const INSERT_SQL = 'INSERT INTO study_sessions (id, user_id, subject, duration_min, session_type, session_time, notes)
                    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id = id';

try {
    $action = $_GET['action'] ?? '';

    if ($action === 'health') {
        try { db(); json_out(['status' => 'ok']); }
        catch (Throwable $e) { json_out(['status' => 'down'], 503); }
    }

    $uid = current_user_id();
    if (!$uid) fail('Sign in to sync your sessions.', 401);
    $pdo = db();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $st = $pdo->prepare('SELECT id, subject, duration_min, session_type, session_time, notes
                             FROM study_sessions WHERE user_id = ? ORDER BY session_time DESC');
        $st->execute([$uid]);
        $out = [];
        foreach ($st as $r) {
            $t = new DateTime($r['session_time'], new DateTimeZone('UTC'));
            $out[] = ['id' => $r['id'], 'subject' => $r['subject'], 'duration' => (int)$r['duration_min'],
                      'type' => $r['session_type'], 'timestamp' => $t->format('Y-m-d\TH:i:s.v\Z'), 'notes' => $r['notes']];
        }
        json_out($out);
    }

    if ($action === 'delete') {
        $id = trim($_GET['id'] ?? '');
        if ($id === '') fail('Missing id.', 400);
        $pdo->prepare('DELETE FROM study_sessions WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
        json_out(['status' => 'success']);
    }

    if ($action === 'clear') {
        $pdo->prepare('DELETE FROM study_sessions WHERE user_id = ?')->execute([$uid]);
        json_out(['status' => 'success']);
    }

    if ($action === 'seed') {
        $tz = max(-840, min(840, (int)($_GET['tzOffset'] ?? 0)));
        $local = fn(int $daysAgo, int $h, int $m) => gmdate('Y-m-d', time() - $tz * 60 - $daysAgo * 86400) . sprintf(' %02d:%02d:00', $h, $m);
        $utc = function (string $localTime, int $plusMin = 0) use ($tz) {
            $d = new DateTime($localTime, new DateTimeZone('UTC'));
            $d->modify(($tz + $plusMin) . ' minutes');
            return $d->format('Y-m-d H:i:s.v');
        };
        $subjects = ['Web Technologies (Servlets)', 'Data Structures & Algorithms', 'Database Management (MySQL)', 'Computer Networks', 'Software Engineering'];
        $rows = [
            ['Web Technologies (Servlets)', 50, 'focus', 9, 30, 'Implemented Servlet Life Cycle methods'],
            ['Hydration & Walk', 10, 'break', 10, 25, 'Morning coffee & eye rest'],
            ['Web Technologies (JSP)', 45, 'focus', 10, 40, 'Constructed custom JavaBean mapping'],
            ['Stretch Break', 10, 'break', 11, 30, 'Quick stretch'],
            ['Data Structures & Algorithms', 60, 'focus', 14, 0, 'Practiced Graph BFS/DFS traversal'],
            ['Tea & Walk', 15, 'break', 15, 5, 'Outdoor walk'],
        ];
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM study_sessions WHERE user_id = ?')->execute([$uid]);
        $ins = $pdo->prepare(INSERT_SQL);
        foreach ($rows as $r) $ins->execute([new_id(), $uid, $r[0], $r[1], $r[2], $utc($local(0, $r[3], $r[4])), $r[5]]);
        for ($d = 1; $d <= 6; $d++) {
            $count = 3 + ($d % 3);
            for ($s = 0; $s < $count; $s++) {
                $mins = 35 + (($s * 15 + $d * 10) % 55);
                $start = $local($d, 10 + $s * 2, 0);
                $ins->execute([new_id(), $uid, $subjects[($s + $d) % 5], $mins, 'focus', $utc($start), 'Coursework revision']);
                if ($s < $count - 1) {
                    $ins->execute([new_id(), $uid, 'Rest Break', 10 + (($s * 5) % 15), 'break', $utc($start, $mins + 2), 'Screen pause']);
                }
            }
        }
        $pdo->commit();
        json_out(['status' => 'success']);
    }

    // Add one session
    $subject = trim($_POST['subject'] ?? '');
    $type = $_POST['type'] ?? '';
    $mins = (int)($_POST['duration'] ?? 0);
    $notes = mb_substr(trim($_POST['notes'] ?? ''), 0, 500);
    if (mb_strlen($subject) < 2 || mb_strlen($subject) > 150) fail('Subject must be 2-150 characters.', 400);
    if (!in_array($type, ['focus', 'break'], true)) fail('Type must be focus or break.', 400);
    if ($mins < 1 || $mins > 480) fail('Duration must be 1-480 minutes.', 400);
    try { $when = to_db_time($_POST['timestamp'] ?? 'now'); } catch (Throwable $e) { $when = to_db_time('now'); }
    $id = trim($_POST['id'] ?? '');
    if ($id === '' || strlen($id) > 64) $id = new_id();
    $pdo->prepare(INSERT_SQL)->execute([$id, $uid, $subject, $mins, $type, $when, $notes]);
    json_out(['status' => 'success', 'id' => $id], 201);
} catch (Throwable $e) {
    error_log('ZenPulse sessions: ' . $e->getMessage());
    fail('Server error. Is MySQL running in XAMPP?', 500);
}
