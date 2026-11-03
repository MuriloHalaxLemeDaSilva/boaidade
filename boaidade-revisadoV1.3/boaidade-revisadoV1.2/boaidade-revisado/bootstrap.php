<?php
declare(strict_types=1);

date_default_timezone_set('UTC');

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $dsn = getenv('DB_DSN') ?: 'mysql:host=127.0.0.1;port=3306;dbname=app_db;charset=utf8mb4';
    $dbUser = getenv('DB_USER') ?: 'root';
    $dbPassword = getenv('DB_PASSWORD') ?: '';
    $pdo = new PDO($dsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");

    // Cria as tabelas ausentes sem apagar os dados já existentes.
    $schema = file_get_contents(__DIR__ . '/database.sql');
    if ($schema === false) throw new RuntimeException('Esquema SQL não encontrado.');
    foreach (preg_split('/;\s*(?:\r?\n|$)/', trim($schema)) as $statement) {
        $statement = trim($statement);
        if ($statement !== '') $pdo->exec($statement);
    }
    migrateLegacyCompletions($pdo);
    seedDatabase($pdo);
    return $pdo;
}

function migrateLegacyCompletions(PDO $pdo): void {
    $mark = $pdo->prepare("INSERT IGNORE INTO app_settings (`key`,`value`) VALUES('legacy_completions_migrated','1')");
    $mark->execute();
    if ($mark->rowCount() === 1) {
        $pdo->exec('INSERT INTO activity_completions(user_id,activity_id,completed_at) SELECT user_id,activity_id,completed_at FROM activity_progress');
    }
}

function seedDatabase(PDO $pdo): void {
    if ((int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn() === 0) {
        $email = getenv('ADMIN_EMAIL') ?: 'admin@conecta60.local';
        $password = getenv('ADMIN_PASSWORD') ?: 'Admin@12345';
        $stmt = $pdo->prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')");
        $stmt->execute(['Administrador de teste', $email, password_hash($password, PASSWORD_DEFAULT)]);
        $adminId = (int)$pdo->lastInsertId();
    } else {
        $adminId = (int)$pdo->query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")->fetchColumn();
    }
    $seededActivities = $pdo->query("SELECT `value` FROM app_settings WHERE `key`='starter_activities_seeded'")->fetchColumn();
    if ($seededActivities === false && (int)$pdo->query('SELECT COUNT(*) FROM activities')->fetchColumn() === 0) {
        $stmt = $pdo->prepare('INSERT INTO activities(type,title,description,image_path,words_json,created_by) VALUES(?,?,?,?,?,?)');
        $stmt->execute(['puzzle','Jardim de boas lembranças','Monte a imagem com calma, arrastando as peças para formar o jardim.','assets/puzzle-demo.jpg',null,$adminId]);
        $stmt->execute(['wordsearch','Palavras do cotidiano','Encontre palavras curtas ligadas à convivência e ao bem-estar.',null,json_encode(['AMIGO','FAMILIA','CARINHO','SAUDE','ALEGRIA'],JSON_UNESCAPED_UNICODE),$adminId]);
    }
    if ($seededActivities === false) $pdo->prepare("INSERT INTO app_settings(`key`,`value`) VALUES('starter_activities_seeded','1')")->execute();

    $seededGuides = $pdo->query("SELECT `value` FROM app_settings WHERE `key`='starter_guides_seeded'")->fetchColumn();
    if ($seededGuides === false && (int)$pdo->query('SELECT COUNT(*) FROM guides')->fetchColumn() === 0) {
        $guides = [
            ['step','Como enviar uma foto pelo WhatsApp','WhatsApp','Aprenda a escolher uma foto e enviar para uma pessoa da família.',"1. Abra o WhatsApp e toque na conversa da pessoa.\n2. Toque no ícone de clipe (ou no sinal +) perto da caixa de mensagem.\n3. Escolha Galeria ou Fotos.\n4. Toque na foto desejada para selecioná-la.\n5. Se quiser, escreva uma mensagem e toque na seta verde para enviar.\n6. Aguarde a foto aparecer na conversa. Você pode pedir ajuda antes de confirmar o envio."],
            ['step','Aumentar o tamanho das letras do celular','Acessibilidade','Veja como deixar os textos mais confortáveis para ler.',"1. Abra o aplicativo Configurações do celular.\n2. Procure por Tela, Visor ou Acessibilidade.\n3. Toque em Tamanho da fonte ou Texto e exibição.\n4. Arraste o controle para aumentar as letras.\n5. Confira a prévia e ajuste até ficar confortável.\n6. Volte à tela inicial. Os nomes dos menus podem variar conforme o aparelho."],
            ['step','Como reconhecer uma mensagem suspeita','Segurança','Cuidados simples antes de abrir links ou compartilhar dados.',"1. Pare antes de responder a mensagens urgentes ou alarmantes.\n2. Confira o número e confirme a identidade por uma ligação conhecida.\n3. Não abra links inesperados nem instale aplicativos a pedido de desconhecidos.\n4. Nunca compartilhe senha, código de verificação ou dados bancários.\n5. Em caso de dúvida, peça opinião a alguém de confiança.\n6. Bloqueie e denuncie contatos que insistirem em pedir dinheiro ou informações."],
        ];
        $stmt = $pdo->prepare('INSERT INTO guides(type,title,category,summary,content,created_by) VALUES(?,?,?,?,?,?)');
        foreach ($guides as $guide) $stmt->execute([...$guide,$adminId]);
    }
    if ($seededGuides === false) $pdo->prepare("INSERT INTO app_settings(`key`,`value`) VALUES('starter_guides_seeded','1')")->execute();
}

function recordUsage(PDO $pdo, int $userId): void {
    $today = (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d');
    $stmt = $pdo->prepare('INSERT INTO user_usage_days(user_id,usage_date) VALUES(?,?) ON DUPLICATE KEY UPDATE last_seen_at=CURRENT_TIMESTAMP');
    $stmt->execute([$userId, $today]);
}

function usageStats(PDO $pdo, int $userId): array {
    $q = $pdo->prepare('SELECT usage_date,last_seen_at FROM user_usage_days WHERE user_id=? ORDER BY usage_date DESC LIMIT 4000');
    $q->execute([$userId]); $days = $q->fetchAll();
    $timezone = new DateTimeZone('America/Sao_Paulo');
    $lastDate = $days[0]['usage_date'] ?? null; $today = new DateTimeImmutable('today', $timezone);
    $current = 0;
    if ($lastDate !== null) {
        $cursor = new DateTimeImmutable($lastDate, $timezone);
        $age = (int)$today->diff($cursor)->format('%r%a');
        if ($age === 0 || $age === 1) {
            foreach ($days as $day) {
                if ($day['usage_date'] !== $cursor->format('Y-m-d')) break;
                $current++;
                $cursor = $cursor->modify('-1 day');
            }
        }
    }
    $threshold = $today->modify('-29 days')->format('Y-m-d');
    return ['current_streak'=>$current,'days_used'=>count($days),'last_used'=>$lastDate,'last_seen_at'=>$days[0]['last_seen_at'] ?? null,'days_last_30'=>count(array_filter($days,fn($d)=>$d['usage_date'] >= $threshold))];
}

function jsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function respond(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function requireUser(?string $role = null): array {
    $user = $_SESSION['user'] ?? null;
    if (!$user) respond(['error'=>'Faça login para continuar.'],401);
    if ($role !== null && $user['role'] !== $role) respond(['error'=>'Você não tem permissão para esta operação.'],403);
    if ($user['role'] === 'elderly') recordUsage(db(), (int)$user['id']);
    return $user;
}
function verifyCsrf(): void {
    $received = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$received || !hash_equals($_SESSION['csrf'] ?? '', $received)) respond(['error'=>'Sessão expirada. Atualize a página e tente novamente.'],419);
}
function cleanText(mixed $value, int $max, string $field): string {
    $text = trim((string)$value);
    if ($text === '' || mb_strlen($text) > $max) respond(['error'=>"O campo {$field} é obrigatório e deve ter até {$max} caracteres."],422);
    return $text;
}
