<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');
ini_set('log_errors', '1');

const APP_VERSION = 'v1.4.2';
const AIRLABS_ENDPOINT = 'https://airlabs.co/api/v10/historical';

set_exception_handler(function(Throwable $e) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Uncaught exception: ' . $e->getMessage() . "\n";
    echo 'File: ' . $e->getFile() . ':' . $e->getLine() . "\n";
});
register_shutdown_function(function() {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) { http_response_code(500); header('Content-Type: text/plain; charset=utf-8'); }
        echo "Fatal error: {$e['message']}\nFile: {$e['file']}:{$e['line']}\n";
    }
});

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (str_starts_with($path, '/admin') && function_exists('session_status') && function_exists('session_start')) {
    if (session_status() === PHP_SESSION_NONE) @session_start();
}

if ($path === '/health') { header('Content-Type: text/plain; charset=utf-8'); echo 'OK ' . APP_VERSION; exit; }
if ($path === '/admin/debug') { handle_admin_debug(); exit; }
if ($path === '/admin' || $path === '/admin/') { handle_admin(); exit; }
if ($path === '/api/config') { handle_config(); exit; }
if ($path === '/api/usage') { handle_usage(); exit; }
if ($path === '/api/schedule-access') { handle_schedule_access(); exit; }
if ($path === '/api/schedules') { handle_schedule_lookup(); exit; }
serve_static($path);

function serve_static(string $path): void {
    $file = ($path === '/' || $path === '') ? __DIR__ . '/public/index.html' : realpath(__DIR__ . '/public' . $path);
    $root = realpath(__DIR__ . '/public');
    if (!$file || !$root || strpos((string)$file, $root) !== 0 || !is_file((string)$file)) { http_response_code(404); echo 'Not found'; return; }
    $ext = strtolower(pathinfo((string)$file, PATHINFO_EXTENSION));
    $types = ['html'=>'text/html; charset=utf-8','css'=>'text/css; charset=utf-8','js'=>'application/javascript; charset=utf-8','json'=>'application/json; charset=utf-8','svg'=>'image/svg+xml','png'=>'image/png','ico'=>'image/x-icon'];
    header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
    readfile((string)$file);
}

function json_response(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
function read_json_body(): array { $x = json_decode((string)file_get_contents('php://input'), true); return is_array($x) ? $x : []; }
function env_value(array $names, ?string $default = null): ?string { foreach ($names as $n) { $v = getenv($n); if ($v !== false && $v !== '') return $v; } return $default; }
function env_first_with_name(array $names, ?string $default = null): array { foreach ($names as $n) { $v = getenv($n); if ($v !== false && $v !== '') return [$v, $n]; } return [$default, null]; }
function db_alias_map(): array { return [
    'host'=>['DB_HOST','MYSQL_HOST'],
    'port'=>['DB_PORT','MYSQL_PORT'],
    'database'=>['DB_NAME','MYSQL_NAME','MYSQL_DATABASE'],
    'user'=>['DB_USERNAME','DB_USER','MYSQL_USERNAME','MYSQL_USER'],
    'password'=>['DB_PASSWORD','MYSQL_PASSWORD'],
]; }

function db_connect() {
    static $db = null, $tried = false;
    if ($tried) return $db;
    $tried = true;
    $GLOBALS['db_connect_debug'] = ['attempted'=>false,'used'=>[],'missing'=>[],'connect_errno'=>null,'connect_error'=>null,'mode'=>'Wasmer DB aliases'];
    if (!extension_loaded('mysqli')) { $GLOBALS['db_connect_debug']['connect_error'] = 'PHP mysqli extension is not loaded.'; return null; }
    if (function_exists('mysqli_report')) mysqli_report(MYSQLI_REPORT_OFF);
    $a = db_alias_map();
    [$host,$hostKey] = env_first_with_name($a['host']);
    [$portRaw,$portKey] = env_first_with_name($a['port'], '3306');
    [$name,$nameKey] = env_first_with_name($a['database']);
    [$user,$userKey] = env_first_with_name($a['user']);
    [$pass,$passKey] = env_first_with_name($a['password']);
    $GLOBALS['db_connect_debug']['used'] = ['host'=>$hostKey,'port'=>$portKey,'database'=>$nameKey,'user'=>$userKey,'password'=>$passKey];
    foreach (['host'=>$host,'port'=>$portRaw,'database'=>$name,'user'=>$user,'password'=>$pass] as $k=>$v) {
        if ($v === null || $v === '') $GLOBALS['db_connect_debug']['missing'][] = $k . ' (' . implode(' or ', $a[$k]) . ')';
    }
    if ($host && $name && $user && $portRaw && $pass !== null && $pass !== '') {
        $GLOBALS['db_connect_debug']['attempted'] = true;
        try {
            $db = @new mysqli((string)$host, (string)$user, (string)$pass, (string)$name, (int)$portRaw);
            if (is_object($db)) { $GLOBALS['db_connect_debug']['connect_errno'] = $db->connect_errno; $GLOBALS['db_connect_debug']['connect_error'] = $db->connect_error; }
        } catch (Throwable $e) {
            $GLOBALS['db_connect_debug']['connect_errno'] = (int)$e->getCode(); $GLOBALS['db_connect_debug']['connect_error'] = $e->getMessage(); $db = null;
        }
    } else {
        $GLOBALS['db_connect_debug']['connect_error'] = 'One or more required Wasmer MySQL environment variables are missing.';
    }
    if (is_object($db) && !$db->connect_errno) { @$db->set_charset('utf8mb4'); init_db($db); return $db; }
    $db = null; return null;
}
function db_connect_debug_info(): array { return $GLOBALS['db_connect_debug'] ?? ['attempted'=>false,'used'=>[],'missing'=>[],'connect_errno'=>null,'connect_error'=>'db_connect() has not been called yet.']; }

function init_db($db): void {
    $db->query("CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(120) PRIMARY KEY, setting_value LONGTEXT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $db->query("CREATE TABLE IF NOT EXISTS api_usage_month (month_ym CHAR(7) PRIMARY KEY, calls_made INT NOT NULL DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $db->query("CREATE TABLE IF NOT EXISTS schedule_cache (id INT AUTO_INCREMENT PRIMARY KEY, flight_iata VARCHAR(16) NOT NULL, flight_date DATE NOT NULL, dep_iata VARCHAR(8) NOT NULL, arr_iata VARCHAR(8) NOT NULL, scheduled_dep VARCHAR(8) NULL, scheduled_arr VARCHAR(8) NULL, source VARCHAR(40) NOT NULL DEFAULT 'cache', raw_json LONGTEXT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uniq_sched (flight_iata, flight_date, dep_iata, arr_iata), INDEX idx_route (flight_iata, dep_iata, arr_iata), INDEX idx_updated (updated_at)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $db->query("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('airlabs_monthly_limit','1000'),('airlabs_historical_call_cost','1')");
}

function html_escape($v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function clean($v): string { return trim((string)($v ?? '')); }
function current_month(): string { return gmdate('Y-m'); }
function only_digits($v): string { return preg_replace('/\D+/', '', (string)$v) ?? ''; }
function parse_id_list(string $s): array { $parts = preg_split('/[\s,;]+/', $s, -1, PREG_SPLIT_NO_EMPTY); return array_values(array_unique(array_map('only_digits', $parts ?: []))); }
function masked_value(string $v): string { $l = strlen($v); return $l <= 8 ? str_repeat('*', $l) : substr($v,0,4) . str_repeat('*', max(0,$l-8)) . substr($v,-4); }
function setting_value($db, string $key, ?string $default = null): ?string { $stmt=$db->prepare('SELECT setting_value FROM app_settings WHERE setting_key=?'); $stmt->bind_param('s',$key); $stmt->execute(); $r=$stmt->get_result(); if ($row=$r->fetch_assoc()) return (string)$row['setting_value']; return $default; }
function set_setting_value($db, string $key, string $value): void { $stmt=$db->prepare('INSERT INTO app_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_at=CURRENT_TIMESTAMP'); $stmt->bind_param('ss',$key,$value); $stmt->execute(); }
function admin_password_hash($db): ?string { return setting_value($db, 'admin_password_hash', null); }
function admin_is_logged_in($db): bool { return !empty($_SESSION['admin_ok']); }
function monthly_limit($db): int { return max(1, (int)setting_value($db, 'airlabs_monthly_limit', '1000')); }
function historical_call_cost($db): int { return max(1, (int)setting_value($db, 'airlabs_historical_call_cost', '1')); }
function get_allowed_ids($db): array { return parse_id_list((string)setting_value($db, 'schedule_allowed_employee_ids', (string)env_value(['SCHEDULE_ALLOWED_EMPLOYEE_IDS','AIRLABS_ALLOWED_EMPLOYEE_IDS'], ''))); }
function get_month_usage($db): array { $m=current_month(); $stmt=$db->prepare('INSERT IGNORE INTO api_usage_month (month_ym, calls_made) VALUES (?,0)'); $stmt->bind_param('s',$m); $stmt->execute(); $stmt=$db->prepare('SELECT calls_made FROM api_usage_month WHERE month_ym=?'); $stmt->bind_param('s',$m); $stmt->execute(); $row=$stmt->get_result()->fetch_assoc(); return ['month'=>$m,'calls_made'=>(int)($row['calls_made']??0),'monthly_limit'=>monthly_limit($db)]; }
function increment_usage($db, int $units): void { if ($units <= 0) return; $m=current_month(); $stmt=$db->prepare('INSERT INTO api_usage_month (month_ym,calls_made) VALUES (?,?) ON DUPLICATE KEY UPDATE calls_made=calls_made+VALUES(calls_made), updated_at=CURRENT_TIMESTAMP'); $stmt->bind_param('si',$m,$units); $stmt->execute(); }

function handle_config(): void { $db=db_connect(); $allowed=$db ? get_allowed_ids($db) : []; json_response(['ok'=>true,'version'=>APP_VERSION,'database_connected'=>(bool)$db,'schedules_available'=>(bool)($db && setting_value($db,'airlabs_api_key','') && $allowed),'allowed_employee_ids_configured'=>count($allowed)>0,'db_debug'=>db_connect_debug_info()]); }
function handle_usage(): void { $db=db_connect(); if (!$db) { json_response(['ok'=>false,'error'=>'database_not_connected','db_debug'=>db_connect_debug_info()],500); return; } json_response(['ok'=>true,'monthly_usage'=>get_month_usage($db),'historical_call_cost'=>historical_call_cost($db)]); }
function handle_schedule_access(): void { $db=db_connect(); if (!$db) { json_response(['ok'=>false,'allowed'=>false,'reason'=>'database_not_connected','db_debug'=>db_connect_debug_info()],500); return; } $body=read_json_body(); $given=array_map('only_digits', $body['employee_ids'] ?? []); $allowed=get_allowed_ids($db); $ok = (bool)array_intersect($given,$allowed); json_response(['ok'=>true,'allowed'=>$ok,'reason'=>$ok?'allowed':'employee_id_not_allowed','monthly_usage'=>get_month_usage($db)]); }

function normalize_flight_iata(string $flight): string { $f=strtoupper(preg_replace('/\s+/', '', $flight)); if (preg_match('/^([A-Z]{2})(0+)(\d+[A-Z]?)$/', $f, $m)) return $m[1] . $m[3]; return $f; }
function is_sas_flight(string $f): bool { return (bool)preg_match('/^SK\d+[A-Z]?$/', normalize_flight_iata($f)); }
function hhmm(?string $s): string { $s=(string)$s; if (preg_match('/(\d{2}:\d{2})/', $s, $m)) return $m[1]; return ''; }
function date_part(?string $s): string { $s=(string)$s; if (preg_match('/(\d{4}-\d{2}-\d{2})/', $s, $m)) return $m[1]; return ''; }
function minutes_of_day(string $t): ?int { if (!preg_match('/^(\d{1,2}):(\d{2})/', trim($t), $m)) return null; return ((int)$m[1])*60 + (int)$m[2]; }
function time_diff_minutes(string $a, string $b): ?int { $ma=minutes_of_day($a); $mb=minutes_of_day($b); if ($ma===null || $mb===null) return null; $d=abs($ma-$mb); return min($d, 1440-$d); }
function schedule_time_reject_reason(string $scheduledDep, string $scheduledArr, string $actualDep='', string $actualArr=''): string {
    $checks = [];
    if ($actualDep && $scheduledDep) $checks[] = ['Departure', $scheduledDep, $actualDep, time_diff_minutes($scheduledDep, $actualDep)];
    if ($actualArr && $scheduledArr) $checks[] = ['Arrival', $scheduledArr, $actualArr, time_diff_minutes($scheduledArr, $actualArr)];
    foreach ($checks as [$label, $scheduled, $actual, $diff]) {
        if ($diff !== null && $diff > 60) {
            return $label . ' scheduled time ' . $scheduled . ' is ' . $diff . ' minutes from the actual CSV time ' . $actual . '; not added because it is outside the 60-minute window.';
        }
    }
    return '';
}
function cached_row_is_stale(array $row, array $f): bool {
    if (empty($row['scheduled_dep']) || empty($row['scheduled_arr'])) return false;
    return schedule_time_reject_reason((string)$row['scheduled_dep'], (string)$row['scheduled_arr'], (string)($f['actual_dep'] ?? ''), (string)($f['actual_arr'] ?? '')) !== '';
}
function cache_get_exact($db, array $f): ?array { $stmt=$db->prepare('SELECT * FROM schedule_cache WHERE flight_iata=? AND flight_date=? AND dep_iata=? AND arr_iata=? LIMIT 1'); $stmt->bind_param('ssss',$f['flight_iata'],$f['flight_date'],$f['dep_iata'],$f['arr_iata']); $stmt->execute(); $row=$stmt->get_result()->fetch_assoc(); return $row ?: null; }
function cache_get_route($db, array $f): ?array { $stmt=$db->prepare("SELECT * FROM schedule_cache WHERE flight_iata=? AND dep_iata=? AND arr_iata=? AND COALESCE(scheduled_dep,'')<>'' AND COALESCE(scheduled_arr,'')<>'' ORDER BY updated_at DESC LIMIT 1"); $stmt->bind_param('sss',$f['flight_iata'],$f['dep_iata'],$f['arr_iata']); $stmt->execute(); $row=$stmt->get_result()->fetch_assoc(); return $row ?: null; }
function cache_set($db, array $f, string $dep, string $arr, string $source, array $raw): void { $json=json_encode($raw, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); $stmt=$db->prepare('INSERT INTO schedule_cache (flight_iata,flight_date,dep_iata,arr_iata,scheduled_dep,scheduled_arr,source,raw_json) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE scheduled_dep=VALUES(scheduled_dep), scheduled_arr=VALUES(scheduled_arr), source=VALUES(source), raw_json=VALUES(raw_json), updated_at=CURRENT_TIMESTAMP'); $stmt->bind_param('ssssssss',$f['flight_iata'],$f['flight_date'],$f['dep_iata'],$f['arr_iata'],$dep,$arr,$source,$json); $stmt->execute(); }
function result_for(array $f, string $status, string $source='', string $dep='', string $arr='', string $message=''): array { return ['rowIndex'=>$f['rowIndex'] ?? null,'flight_iata'=>$f['flight_iata'] ?? '','flight_date'=>$f['flight_date'] ?? '','dep_iata'=>$f['dep_iata'] ?? '','arr_iata'=>$f['arr_iata'] ?? '','scheduled_dep'=>$dep,'scheduled_arr'=>$arr,'status'=>$status,'source'=>$source,'message'=>$message]; }

function airlabs_fetch(string $flight, string $apiKey): array {
    $url = AIRLABS_ENDPOINT . '?flight_iata=' . rawurlencode($flight) . '&api_key=' . rawurlencode($apiKey);
    $ctx = stream_context_create(['http'=>['method'=>'GET','timeout'=>18,'ignore_errors'=>true,'header'=>"Accept: application/json\r\n"]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return ['ok'=>false,'error'=>'AirLabs request failed'];
    $json = json_decode($raw, true);
    if (!is_array($json)) return ['ok'=>false,'error'=>'AirLabs returned invalid JSON','raw'=>$raw];
    $rows = [];
    if (isset($json['response']) && is_array($json['response'])) $rows = $json['response'];
    elseif (isset($json[0]) && is_array($json[0])) $rows = $json;
    elseif (isset($json['data']) && is_array($json['data'])) $rows = $json['data'];
    return ['ok'=>true,'rows'=>$rows,'raw'=>$json];
}
function match_airlabs_rows(array $rows, array $f, ?string &$rejectReason = null): ?array {
    $rejectReason = null;
    $candidates=[];
    foreach ($rows as $r) {
        if (!is_array($r)) continue;
        $dep=strtoupper((string)($r['dep_iata'] ?? '')); $arr=strtoupper((string)($r['arr_iata'] ?? ''));
        if ($dep !== $f['dep_iata'] || $arr !== $f['arr_iata']) continue;
        $sd=hhmm($r['dep_time'] ?? ''); $sa=hhmm($r['arr_time'] ?? '');
        if (!$sd || !$sa) continue;
        $date=date_part($r['dep_time'] ?? '') ?: date_part($r['arr_time'] ?? '');
        $candidates[]=['dep'=>$sd,'arr'=>$sa,'date'=>$date,'raw'=>$r];
    }
    usort($candidates, function($a, $b) use ($f) {
        return (($b['date'] === $f['flight_date']) <=> ($a['date'] === $f['flight_date']));
    });
    $firstReject = null;
    foreach ($candidates as $c) {
        $reason = schedule_time_reject_reason($c['dep'], $c['arr'], (string)($f['actual_dep'] ?? ''), (string)($f['actual_arr'] ?? ''));
        if ($reason) { if ($firstReject === null) $firstReject = $reason; continue; }
        $c['source'] = ($c['date'] === $f['flight_date']) ? 'airlabs' : 'airlabs_route';
        return $c;
    }
    if ($firstReject !== null) $rejectReason = $firstReject;
    return null;
}

function handle_schedule_lookup(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { json_response(['ok'=>false,'error'=>'POST required'],405); return; }
    $db=db_connect(); if (!$db) { json_response(['ok'=>false,'error'=>'database_not_connected','db_debug'=>db_connect_debug_info()],500); return; }
    $body=read_json_body(); $ids=array_map('only_digits', $body['employee_ids'] ?? []); if (!array_intersect($ids, get_allowed_ids($db))) { json_response(['ok'=>false,'error'=>'employee_id_not_allowed'],403); return; }
    $apiKey=(string)setting_value($db,'airlabs_api_key',''); if (!$apiKey) { json_response(['ok'=>false,'error'=>'airlabs_api_key_missing'],400); return; }
    $flights=[]; foreach (($body['flights'] ?? []) as $x) { if (!is_array($x)) continue; $f=['rowIndex'=>$x['rowIndex']??null,'flight_iata'=>normalize_flight_iata((string)($x['flight_iata']??'')),'flight_date'=>(string)($x['flight_date']??''),'dep_iata'=>strtoupper((string)($x['dep_iata']??'')),'arr_iata'=>strtoupper((string)($x['arr_iata']??'')),'actual_dep'=>hhmm($x['actual_dep']??''),'actual_arr'=>hhmm($x['actual_arr']??'')]; if ($f['flight_iata'] && $f['flight_date'] && $f['dep_iata'] && $f['arr_iata']) $flights[]=$f; }
    if (!$flights) { json_response(['ok'=>true,'results'=>[],'calls_made'=>0,'http_requests_made'=>0,'monthly_usage'=>get_month_usage($db),'historical_call_cost'=>historical_call_cost($db)]); return; }
    $results=[]; $needs=[];
    foreach ($flights as $f) {
        if (!is_sas_flight($f['flight_iata'])) { $results[] = result_for($f,'skipped','', '', '', 'Scheduled lookup only supports SAS SK flight numbers'); continue; }
        $c=cache_get_exact($db,$f); if ($c && !cached_row_is_stale($c,$f) && $c['scheduled_dep'] && $c['scheduled_arr']) { $results[]=result_for($f,'cached','cache',(string)$c['scheduled_dep'],(string)$c['scheduled_arr']); continue; }
        $r=cache_get_route($db,$f); if ($r && !cached_row_is_stale($r,$f)) { $results[]=result_for($f,'cached','cache_route',(string)$r['scheduled_dep'],(string)$r['scheduled_arr']); cache_set($db,$f,(string)$r['scheduled_dep'],(string)$r['scheduled_arr'],'cache_route',[]); continue; }
        $needs[]=$f;
    }
    $calls=0; $http=0; $cost=historical_call_cost($db); $usage=get_month_usage($db); $remaining=$usage['monthly_limit'] - $usage['calls_made'];
    $byFlight=[]; foreach ($needs as $f) $byFlight[$f['flight_iata']][]=$f;
    foreach ($byFlight as $flight=>$items) {
        if ($remaining < $cost) { foreach ($items as $f) $results[]=result_for($f,'missing','usage_limit','','','Monthly AirLabs request limit reached'); continue; }
        $resp=airlabs_fetch($flight,$apiKey); $http++; $calls += $cost; $remaining -= $cost; increment_usage($db,$cost);
        if (!$resp['ok']) { foreach ($items as $f) $results[]=result_for($f,'missing','airlabs','','',$resp['error'] ?? 'AirLabs request failed'); continue; }
        foreach ($items as $f) {
            $rejectReason = null;
            $m=match_airlabs_rows($resp['rows'] ?? [], $f, $rejectReason);
            if ($m) { cache_set($db,$f,$m['dep'],$m['arr'],$m['source'],$m['raw']); $results[]=result_for($f,'found',$m['source'],$m['dep'],$m['arr']); }
            else $results[]=result_for($f,'missing','airlabs','','',$rejectReason ?: 'No matching scheduled dep_time/arr_time found within 60 minutes of the actual CSV time for this flight number and route');
        }
    }
    json_response(['ok'=>true,'results'=>$results,'calls_made'=>$calls,'http_requests_made'=>$http,'historical_call_cost'=>$cost,'monthly_usage'=>get_month_usage($db)]);
}

function admin_require_post(): bool { return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST'; }
function redirect_admin(): void { header('Location: /admin'); exit; }
function admin_cache_count($db): int { $res=$db->query('SELECT COUNT(*) AS c FROM schedule_cache'); if ($res && ($row=$res->fetch_assoc())) return (int)$row['c']; return 0; }
function render_admin_page(string $body, string $title='Admin'): void {
    header('Content-Type: text/html; charset=utf-8');
    $pageTitle = html_escape($title).' - Airside LogTen';
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$pageTitle.'</title><style>
:root{--bg:#f5f7fb;--panel:rgba(255,255,255,.88);--panel-solid:#fff;--text:#111827;--muted:#6b7280;--line:#e5e7eb;--subtle:#eef2f7;--blue:#2563eb;--blue2:#1d4ed8;--green:#15803d;--amber:#b45309;--red:#b91c1c;--purple:#7c3aed;--shadow:0 20px 60px rgba(15,23,42,.10);--radius:22px}
*{box-sizing:border-box}body{margin:0;min-height:100vh;color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:radial-gradient(circle at top left,rgba(37,99,235,.18),transparent 32rem),radial-gradient(circle at 90% 5%,rgba(124,58,237,.14),transparent 28rem),linear-gradient(180deg,#f8fbff,var(--bg))}.wrap{width:min(1220px,calc(100% - 32px));margin:28px auto 42px}.top{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:18px}.brand{display:flex;align-items:center;gap:12px;min-width:0}.logo{width:46px;height:46px;border-radius:15px;background:linear-gradient(135deg,#111827,#2563eb);color:white;display:grid;place-items:center;font-weight:900;box-shadow:0 16px 30px rgba(37,99,235,.25);flex:0 0 auto}.brand h1{margin:0;font-size:clamp(24px,3vw,38px);line-height:1.05;letter-spacing:-.045em}.brand p,.muted,.help{margin:4px 0 0;color:var(--muted);font-size:14px;line-height:1.45}.panel{background:var(--panel);backdrop-filter:blur(16px);border:1px solid rgba(229,231,235,.92);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}.section{margin-top:18px}.head{padding:20px 22px 12px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.45)}.head h2{margin:0;font-size:18px;letter-spacing:-.02em}.head p{margin:7px 0 0;color:var(--muted);font-size:13px;line-height:1.45}.body{padding:18px 22px 22px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}.grid>div,.grid>form{min-width:0}@media(max-width:760px){.top{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.wrap{width:min(100% - 22px,1220px)}}label{display:block;font-weight:850;font-size:13px;margin:0 0 7px;color:#111827}input,textarea,select{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;border:1px solid #d1d5db;border-radius:14px;padding:12px 14px;font:inherit;font-size:14px;background:white;color:#111827;outline:none;box-shadow:0 1px 0 rgba(15,23,42,.02)}input:focus,textarea:focus,select:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.12)}textarea{min-height:120px;resize:vertical}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.section form{margin:0}.btn,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:14px;padding:12px 14px;font-size:14px;font-weight:850;text-decoration:none;cursor:pointer;transition:140ms ease}.btn:hover,button:hover{transform:translateY(-1px)}.primary{background:linear-gradient(135deg,var(--blue),var(--blue2));color:white;box-shadow:0 12px 24px rgba(37,99,235,.22)}.secondary{background:#eef2ff;color:#1f2937}.ghost{background:#f3f4f6;color:#374151}.danger{background:#fee2e2;color:#b91c1c}.alert{padding:12px 14px;border-radius:14px;margin-bottom:14px;font-weight:650;font-size:13px;line-height:1.45}.ok{background:#ecfdf5;color:var(--green);border:1px solid #bbf7d0}.warn{background:#fffbeb;color:var(--amber);border:1px solid #fde68a}.err{background:#fef2f2;color:var(--red);border:1px solid #fecaca}.stat{border:1px solid var(--line);border-radius:17px;padding:15px;background:var(--panel-solid);min-height:86px}.stat b{display:block;font-size:24px;font-weight:900;letter-spacing:-.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stat span{display:block;color:var(--muted);font-size:12px;margin-top:5px;font-weight:700}code{background:#f3f4f6;padding:2px 5px;border-radius:6px}.app-identity{border-top:1px solid var(--line);margin-top:28px;padding-top:18px;color:var(--muted);font-size:11px;line-height:1.45}.app-identity strong{display:block;color:#374151;font-size:13px;font-weight:800;margin-bottom:2px}.app-identity em{font-style:normal}
</style></head><body><main class="wrap"><div class="top"><div class="brand"><div class="logo">AL</div><div><h1>Airside ⟶ LogTen Admin</h1><p>'.APP_VERSION.' · Wasmer backend settings</p></div></div><div><a class="btn ghost" href="/">Open app</a></div></div>'.$body.'<footer class="app-identity"><strong>Airside ⟶ LogTen Importer</strong><div>'.APP_VERSION.'</div><em>Made for SAS pilots ✈️</em></footer></main></body></html>';
}

function env_presence_rows(): string { $names=['DB_HOST','DB_PORT','DB_NAME','DB_USERNAME','DB_USER','DB_PASSWORD','MYSQL_HOST','MYSQL_PORT','MYSQL_DATABASE','MYSQL_NAME','MYSQL_USERNAME','MYSQL_USER','MYSQL_PASSWORD','DATABASE_URL']; $out=''; foreach($names as $n){ $out.='<div class="stat"><b>'.(getenv($n)!==false&&getenv($n)!==''?'present':'missing').'</b><span>'.html_escape($n).'</span></div>'; } return $out; }
function handle_admin_debug(): void { $db=db_connect(); $d=db_connect_debug_info(); $used=''; foreach (($d['used'] ?? []) as $k=>$v) $used.='<div class="stat"><b>'.html_escape($v ?: '-').'</b><span>used for '.html_escape($k).'</span></div>'; $body='<section class="panel"><div class="head"><h2>Diagnostics</h2><p>Runtime, database, environment aliases, and connection status.</p></div><div class="body">'.($db?'<div class="alert ok">Database connection opened successfully.</div>':'<div class="alert err">Database connection could not be opened.</div>').'<div class="grid"><div class="stat"><b>'.(extension_loaded('mysqli')?'yes':'no').'</b><span>mysqli extension loaded</span></div><div class="stat"><b>'.html_escape(!empty($d['attempted'])?'yes':'no').'</b><span>connection attempted</span></div><div class="stat"><b>'.html_escape((string)($d['connect_errno'] ?? '-')).'</b><span>MySQL errno</span></div><div class="stat"><b>'.html_escape(implode(', ', $d['missing'] ?? []) ?: '-').'</b><span>missing aliases</span></div>'.$used.'</div><div class="alert warn" style="margin-top:14px"><strong>MySQL error:</strong> '.html_escape((string)($d['connect_error'] ?? '-')).'</div></div></section><section class="panel section"><div class="head"><h2>Environment variable presence</h2><p>Values are never shown.</p></div><div class="body"><div class="grid">'.env_presence_rows().'</div><div class="actions"><a class="btn secondary" href="/api/config">Open /api/config</a><a class="btn ghost" href="/admin">Back to admin</a></div></div></section>'; render_admin_page($body,'Diagnostics'); }

function output_backup($db, bool $includeCache): void { $settings=[]; $res=$db->query('SELECT setting_key, setting_value, updated_at FROM app_settings ORDER BY setting_key'); while($res && ($row=$res->fetch_assoc())) $settings[]=$row; $cache=[]; if($includeCache){ $res=$db->query('SELECT flight_iata, flight_date, dep_iata, arr_iata, scheduled_dep, scheduled_arr, source, raw_json, updated_at FROM schedule_cache ORDER BY id'); while($res && ($row=$res->fetch_assoc())) $cache[]=$row; } $usage=[]; $res=$db->query('SELECT month_ym, calls_made, updated_at FROM api_usage_month ORDER BY month_ym'); while($res && ($row=$res->fetch_assoc())) $usage[]=$row; header('Content-Type: application/json'); header('Content-Disposition: attachment; filename="airside_logten_backup_'.gmdate('Ymd_His').'.json"'); echo json_encode(['version'=>APP_VERSION,'settings'=>$settings,'api_usage_month'=>$usage,'schedule_cache'=>$cache], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); }
function restore_backup($db, array $payload, bool $replaceCache): array { $sc=0;$cc=0;$uc=0; foreach (($payload['settings']??[]) as $r){ if(!is_array($r)||!isset($r['setting_key'])) continue; set_setting_value($db,(string)$r['setting_key'],(string)($r['setting_value']??'')); $sc++; } foreach (($payload['api_usage_month']??[]) as $r){ if(!is_array($r)||empty($r['month_ym'])) continue; $month=(string)$r['month_ym']; $calls=max(0,(int)($r['calls_made']??0)); $stmt=$db->prepare('INSERT INTO api_usage_month (month_ym, calls_made) VALUES (?,?) ON DUPLICATE KEY UPDATE calls_made=VALUES(calls_made), updated_at=CURRENT_TIMESTAMP'); $stmt->bind_param('si',$month,$calls); $stmt->execute(); $uc++; } if($replaceCache) $db->query('TRUNCATE TABLE schedule_cache'); foreach (($payload['schedule_cache']??[]) as $r){ if(!is_array($r)) continue; $f=['flight_iata'=>(string)($r['flight_iata']??''),'flight_date'=>(string)($r['flight_date']??''),'dep_iata'=>(string)($r['dep_iata']??''),'arr_iata'=>(string)($r['arr_iata']??'')]; if(!$f['flight_iata']||!$f['flight_date']||!$f['dep_iata']||!$f['arr_iata']) continue; cache_set($db,$f,(string)($r['scheduled_dep']??''),(string)($r['scheduled_arr']??''),(string)($r['source']??'backup'),json_decode((string)($r['raw_json']??'[]'),true) ?: []); $cc++; } return ['settings'=>$sc,'cache'=>$cc,'usage'=>$uc]; }
function run_admin_schedule_test($db, string $flight, string $date, string $dep, string $arr, string $actual): array { $body=['employee_ids'=>get_allowed_ids($db) ?: ['admin-test'], 'flights'=>[['rowIndex'=>0,'flight_iata'=>normalize_flight_iata($flight),'flight_date'=>$date,'dep_iata'=>strtoupper($dep),'arr_iata'=>strtoupper($arr),'actual_dep'=>$actual]]]; $_SERVER['REQUEST_METHOD']='POST'; return ['ok'=>true,'message'=>'Use the main app to scan schedules. Test settings saved.']; }

function handle_admin(): void {
    $db=db_connect(); if(!$db){ render_admin_page('<section class="panel"><div class="head"><h2>Database not connected</h2><p>The admin page stores settings in MySQL.</p></div><div class="body"><div class="alert err">No database connection was detected.</div><p class="muted">Open <a href="/admin/debug">/admin/debug</a> to see exactly which Wasmer variables PHP can see.</p></div></section>','Admin setup'); return; }
    $message=''; $class='ok'; $hasAdmin=(bool)admin_password_hash($db);
    if(admin_require_post()){
        $action=(string)($_POST['action']??'');
        if($action==='setup_admin' && !$hasAdmin){ $p=(string)($_POST['password']??''); $c=(string)($_POST['confirm']??''); if(strlen($p)<10){$message='Use an admin password with at least 10 characters.';$class='err';} elseif($p!==$c){$message='Passwords do not match.';$class='err';} else { set_setting_value($db,'admin_password_hash',password_hash($p,PASSWORD_DEFAULT)); $_SESSION['admin_ok']=true; redirect_admin(); } }
        elseif($action==='login'){ $p=(string)($_POST['password']??''); if($hasAdmin && password_verify($p,(string)admin_password_hash($db))){$_SESSION['admin_ok']=true; redirect_admin();} else {$message='Wrong admin password.';$class='err';} }
        elseif($action==='logout'){ $_SESSION=[]; redirect_admin(); }
        elseif(admin_is_logged_in($db)){
            if($action==='save_settings'){ if(trim((string)$_POST['airlabs_api_key'])!=='') set_setting_value($db,'airlabs_api_key',trim((string)$_POST['airlabs_api_key'])); set_setting_value($db,'airlabs_monthly_limit',(string)max(1,(int)$_POST['airlabs_monthly_limit'])); set_setting_value($db,'airlabs_historical_call_cost',(string)max(1,(int)$_POST['airlabs_historical_call_cost'])); set_setting_value($db,'schedule_allowed_employee_ids',(string)$_POST['schedule_allowed_employee_ids']); $message='Settings saved.'; }
            elseif($action==='clear_cache'){ $db->query('TRUNCATE TABLE schedule_cache'); $message='Schedule cache cleared.'; }
            elseif($action==='set_usage'){ $m=current_month(); $calls=max(0,(int)($_POST['current_month_calls']??0)); $stmt=$db->prepare('INSERT INTO api_usage_month (month_ym, calls_made) VALUES (?,?) ON DUPLICATE KEY UPDATE calls_made=VALUES(calls_made), updated_at=CURRENT_TIMESTAMP'); $stmt->bind_param('si',$m,$calls); $stmt->execute(); $message='Current month API usage set to '.$calls.'.'; }
            elseif($action==='reset_usage'){ $m=current_month(); $stmt=$db->prepare('DELETE FROM api_usage_month WHERE month_ym=?'); $stmt->bind_param('s',$m); $stmt->execute(); $message='Current month API usage reset.'; }
            elseif($action==='change_password'){ $p=(string)($_POST['password']??''); $c=(string)($_POST['confirm']??''); if(strlen($p)<10){$message='Use at least 10 characters.';$class='err';} elseif($p!==$c){$message='Passwords do not match.';$class='err';} else {set_setting_value($db,'admin_password_hash',password_hash($p,PASSWORD_DEFAULT));$message='Admin password changed.';} }
            elseif($action==='export_backup'){ output_backup($db,!empty($_POST['include_cache'])); exit; }
            elseif($action==='restore_backup'){ $json=''; if(!empty($_FILES['backup_file']['tmp_name']) && is_uploaded_file($_FILES['backup_file']['tmp_name'])) $json=(string)file_get_contents($_FILES['backup_file']['tmp_name']); else $json=(string)($_POST['backup_json']??''); $p=json_decode($json,true); if(!is_array($p)){ $message='Backup restore failed: invalid JSON.'; $class='err'; } else { $n=restore_backup($db,$p,!empty($_POST['replace_cache'])); $message='Backup restored: '.$n['settings'].' setting(s), '.($n['usage']??0).' usage row(s), '.$n['cache'].' cache row(s).'; } }
            elseif($action==='test_schedule'){ $message='Test mode: save settings, then use the main app scan. Backend API is active if /api/config shows schedules_available true.'; }
        }
        $hasAdmin=(bool)admin_password_hash($db);
    }
    if(!$hasAdmin){ render_admin_page('<section class="panel"><div class="head"><h2>First-time admin setup</h2><p>Create the admin password.</p></div><div class="body">'.($message?'<div class="alert '.$class.'">'.html_escape($message).'</div>':'<div class="alert warn">Do this immediately after deployment.</div>').'<form method="post"><input type="hidden" name="action" value="setup_admin"><div class="grid"><div><label>Admin password</label><input type="password" name="password" required></div><div><label>Confirm password</label><input type="password" name="confirm" required></div></div><div class="actions"><button class="primary">Create admin password</button></div></form></div></section>','First-time setup'); return; }
    if(!admin_is_logged_in($db)){ render_admin_page('<section class="panel"><div class="head"><h2>Admin login</h2><p>Enter the admin password.</p></div><div class="body">'.($message?'<div class="alert '.$class.'">'.html_escape($message).'</div>':'').'<form method="post"><input type="hidden" name="action" value="login"><label>Admin password</label><input type="password" name="password" required><div class="actions"><button class="primary">Log in</button></div></form></div></section>','Admin login'); return; }
    $api=(string)setting_value($db,'airlabs_api_key',''); $limit=monthly_limit($db); $cost=historical_call_cost($db); $allowed=(string)setting_value($db,'schedule_allowed_employee_ids',''); $usage=get_month_usage($db); $cache=admin_cache_count($db); $allowedCount=count(parse_id_list($allowed));
    $body='<section class="panel"><div class="head"><h2>AirLabs scheduled-time settings</h2><p>Stored in the Wasmer MySQL database, not in the public HTML.</p></div><div class="body">'.($message?'<div class="alert '.$class.'">'.html_escape($message).'</div>':'').'<div class="grid"><div class="stat"><b>'.html_escape($usage['calls_made'].' / '.$usage['monthly_limit']).'</b><span>AirLabs calls this UTC month ('.html_escape($usage['month']).')</span></div><div class="stat"><b>'.html_escape((string)$cache).'</b><span>cached schedule rows</span></div><div class="stat"><b>'.html_escape((string)$allowedCount).'</b><span>approved Employee IDs</span></div><div class="stat"><b>'.html_escape((string)$cost).'x</b><span>counted units per historical request</span></div><div class="stat"><b>'.($api?'Configured':'Missing').'</b><span>AirLabs API key '.($api?'('.html_escape(masked_value($api)).')':'').'</span></div></div><form method="post" class="section"><input type="hidden" name="action" value="save_settings"><div class="grid"><div><label>AirLabs API key</label><input type="password" name="airlabs_api_key" placeholder="Leave blank to keep current key"><div class="help">Current: '.($api?html_escape(masked_value($api)):'not configured').'</div></div><div><label>Monthly AirLabs limit</label><input type="number" name="airlabs_monthly_limit" value="'.html_escape((string)$limit).'" min="1"></div><div><label>Historical request cost</label><input type="number" name="airlabs_historical_call_cost" value="'.html_escape((string)$cost).'" min="1"></div></div><div style="margin-top:14px"><label>Allowed Employee IDs</label><textarea name="schedule_allowed_employee_ids">'.html_escape($allowed).'</textarea><div class="help">Comma, space, semicolon, or newline separated.</div></div><div class="actions"><button class="primary">Save settings</button><a class="btn secondary" href="/admin/debug">Diagnostics</a><a class="btn ghost" href="/api/config">/api/config</a></div></form><form method="post" class="section"><input type="hidden" name="action" value="set_usage"><div class="grid"><div><label>Current month AirLabs calls used</label><input type="number" name="current_month_calls" value="'.html_escape((string)$usage['calls_made']).'" min="0"><div class="help">Edit this if AirLabs usage was counted outside this app or if you changed databases after a deploy.</div></div></div><div class="actions"><button class="secondary">Save usage count</button></div></form><div class="section"><form method="post" style="display:inline"><input type="hidden" name="action" value="clear_cache"><button class="secondary">Clear schedule cache</button></form> <form method="post" style="display:inline"><input type="hidden" name="action" value="reset_usage"><button class="danger">Reset current month usage</button></form> <form method="post" style="display:inline"><input type="hidden" name="action" value="logout"><button class="ghost">Log out</button></form></div></div></section><section class="panel section"><div class="head"><h2>Import test mode</h2><p>Quick backend check. Use the main app for the full scan.</p></div><div class="body"><form method="post"><input type="hidden" name="action" value="test_schedule"><div class="grid"><div><label>Flight</label><input name="test_flight" placeholder="SK1871"></div><div><label>Date</label><input name="test_date" placeholder="2026-06-23"></div><div><label>Departure IATA</label><input name="test_dep" placeholder="SVG"></div><div><label>Arrival IATA</label><input name="test_arr" placeholder="CPH"></div></div><div class="actions"><button class="secondary">Run test</button></div></form></div></section><section class="panel section"><div class="head"><h2>Backup and restore</h2><p>Backup JSON includes settings and monthly usage, and can optionally include schedule cache.</p></div><div class="body"><div class="grid"><form method="post"><input type="hidden" name="action" value="export_backup"><label><input type="checkbox" name="include_cache" value="1" checked style="width:auto"> Include schedule cache</label><div class="actions"><button class="secondary">Export backup JSON</button></div></form><form method="post" enctype="multipart/form-data"><input type="hidden" name="action" value="restore_backup"><label>Restore backup file</label><input type="file" name="backup_file" accept=".json,application/json"><label><input type="checkbox" name="replace_cache" value="1" style="width:auto"> Replace existing cache</label><div class="actions"><button class="danger">Restore backup</button></div></form></div><form method="post" class="section"><input type="hidden" name="action" value="restore_backup"><label>Or paste backup JSON</label><textarea name="backup_json"></textarea><label><input type="checkbox" name="replace_cache" value="1" style="width:auto"> Replace existing cache</label><div class="actions"><button class="danger">Restore pasted JSON</button></div></form></div></section><section class="panel section"><div class="head"><h2>Change admin password</h2></div><div class="body"><form method="post"><input type="hidden" name="action" value="change_password"><div class="grid"><div><label>New password</label><input type="password" name="password"></div><div><label>Confirm</label><input type="password" name="confirm"></div></div><div class="actions"><button class="secondary">Change password</button></div></form></div></section>';
    render_admin_page($body,'Admin settings');
}
