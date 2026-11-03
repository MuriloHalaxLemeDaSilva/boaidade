<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
ini_set('session.use_strict_mode','1');
ini_set('session.cookie_httponly','1');
ini_set('session.cookie_samesite','Strict');
session_set_cookie_params(['httponly'=>true,'secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','samesite'=>'Strict','path'=>'/']);
session_start();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

function publicUser(array $row): array {
    $id = (int)($row['id'] ?? 0);
    $name = trim((string)($row['name'] ?? ''));
    $email = trim((string)($row['email'] ?? ''));
    $role = (string)($row['role'] ?? '');
    if ($id < 1 || $name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) ||
        !in_array($role, ['elderly', 'family', 'admin'], true)) {
        throw new RuntimeException('Dados de usuário incompletos ou inválidos.');
    }
    return ['id'=>$id, 'name'=>$name, 'email'=>$email, 'role'=>$role];
}

if ($method === 'GET' && $action === 'session') {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $user = null;
    if (isset($_SESSION['user'])) {
        $userId = (int)($_SESSION['user']['id'] ?? 0);
        if ($userId > 0) {
            $query = $pdo->prepare('SELECT id,name,email,role FROM users WHERE id=?');
            $query->execute([$userId]);
            $row = $query->fetch();
            if ($row) {
                try {
                    $user = publicUser($row);
                } catch (Throwable $e) {
                    error_log((string)$e);
                    $user = null;
                }
                if ($user !== null) {
                    $_SESSION['user'] = $user;
                    if ($user['role'] === 'elderly') recordUsage($pdo, $user['id']);
                } else {
                    unset($_SESSION['user']);
                }
            } else {
                unset($_SESSION['user']);
            }
        } else {
            unset($_SESSION['user']);
        }
    }
    respond(['csrf'=>$_SESSION['csrf'],'user'=>$user]);
}
if (in_array($method,['POST','PUT','DELETE'],true)) verifyCsrf();

function activityRows(PDO $pdo, bool $admin = false): array {
    $sql='SELECT id,type,title,description,image_path,words_json FROM activities '.($admin?'':'WHERE active=1 ').'ORDER BY id';
    $rows=$pdo->query($sql)->fetchAll();
    foreach($rows as &$row){$row['id']=(int)$row['id'];$row['words']=json_decode($row['words_json']??'[]',true)?:[];unset($row['words_json']);}
    unset($row); return $rows;
}
function guideRows(PDO $pdo): array {
    $rows=$pdo->query('SELECT id,type,title,category,summary,content,video_path,created_at,updated_at FROM guides ORDER BY category,title')->fetchAll();
    foreach($rows as &$row)$row['id']=(int)$row['id']; unset($row); return $rows;
}
function requestRows(PDO $pdo, array $user): array {
    if($user['role']==='admin') $query=$pdo->query('SELECT h.*,u.name AS user_name FROM help_requests h JOIN users u ON u.id=h.user_id ORDER BY h.created_at DESC');
    elseif($user['role']==='family'){$query=$pdo->prepare('SELECT h.*,u.name AS user_name FROM help_requests h JOIN users u ON u.id=h.user_id JOIN family_links l ON l.elderly_id=h.user_id WHERE l.family_id=? ORDER BY h.created_at DESC');$query->execute([$user['id']]);}
    else{$query=$pdo->prepare('SELECT h.*,u.name AS user_name FROM help_requests h JOIN users u ON u.id=h.user_id WHERE h.user_id=? ORDER BY h.created_at DESC');$query->execute([$user['id']]);}
    $rows=$query->fetchAll(); $updates=$pdo->prepare('SELECT m.id,m.status,m.message,m.created_at,u.name AS author_name,u.role AS author_role FROM help_request_updates m JOIN users u ON u.id=m.author_id WHERE m.request_id=? ORDER BY m.created_at,m.id');
    foreach($rows as &$row){$updates->execute([$row['id']]);$row['updates']=$updates->fetchAll();} unset($row); return $rows;
}
function removeManagedUpload(?string $path): void {
    if($path && str_starts_with($path,'uploads/')){$full=__DIR__.'/'.$path;if(is_file($full))@unlink($full);}
}
function storeUpload(array $file, string $kind): string {
    $max=$kind==='video'?50*1024*1024:5*1024*1024;
    if(($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK || (int)$file['size']>$max) respond(['error'=>$kind==='video'?'O vídeo deve ter até 50 MB.':'A imagem deve ter até 5 MB.'],422);
    $finfo=new finfo(FILEINFO_MIME_TYPE);$mime=$finfo->file($file['tmp_name']);
    $allowed=$kind==='video'?['video/mp4'=>'mp4','video/webm'=>'webm']:['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
    $ext=$allowed[$mime]??null;
    if(!$ext)respond(['error'=>$kind==='video'?'Envie um vídeo MP4 ou WEBM válido.':'Envie uma imagem JPG, PNG ou WEBP válida.'],422);
    $dir=__DIR__.'/uploads';if(!is_dir($dir)&&!mkdir($dir,0750,true)&&!is_dir($dir))respond(['error'=>'Não foi possível preparar o armazenamento.'],500);
    $name=bin2hex(random_bytes(16)).'.'.$ext;
    if(!move_uploaded_file($file['tmp_name'],$dir.'/'.$name))respond(['error'=>'Falha ao salvar o arquivo enviado.'],500);
    return 'uploads/'.$name;
}

try {
 if ($method === 'POST' && $action === 'register') {
    $data=jsonBody(); $role=$data['role']??'';
    if (!in_array($role,['elderly','family'],true)) respond(['error'=>'Escolha uma conta de idoso ou familiar.'],422);
    $name=cleanText($data['name']??'',120,'nome'); $email=strtolower(trim((string)($data['email']??''))); $password=(string)($data['password']??'');
    if (!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($email)>190) respond(['error'=>'Informe um e-mail válido.'],422);
    if (strlen($password)<10 || !preg_match('/[A-Za-z]/',$password) || !preg_match('/[0-9]/',$password)) respond(['error'=>'A senha deve ter pelo menos 10 caracteres, com letras e números.'],422);
    $pdo->beginTransaction();
    if ($role==='family') {
      $code=strtoupper(preg_replace('/[^A-Z0-9]/','',strtoupper((string)($data['connection_code']??''))));
      if (strlen($code)!==12) { $pdo->rollBack(); respond(['error'=>'Informe o código de convite de 12 caracteres fornecido pelo idoso.'],422); }
      $invite=$pdo->prepare('SELECT * FROM family_invites WHERE code_hash=? AND used_at IS NULL AND expires_at > ?');
      $invite->execute([hash('sha256',$code),gmdate('Y-m-d H:i:s')]); $inviteRow=$invite->fetch();
      if (!$inviteRow) { $pdo->rollBack(); respond(['error'=>'Código inválido, expirado ou já utilizado. Peça ao idoso um novo convite.'],422); }
    }
    $ins=$pdo->prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)");
    try { $ins->execute([$name,$email,password_hash($password,PASSWORD_DEFAULT),$role]); }
    catch (PDOException $e) { $pdo->rollBack(); respond(['error'=>'Este e-mail já possui uma conta.'],409); }
    $id=(int)$pdo->lastInsertId();
    if ($role==='family') {
      $pdo->prepare('INSERT INTO family_links(elderly_id,family_id) VALUES(?,?)')->execute([(int)$inviteRow['elderly_id'],$id]);
      $pdo->prepare('UPDATE family_invites SET used_at=? WHERE id=?')->execute([gmdate('Y-m-d H:i:s'),$inviteRow['id']]);
    }
    $user=publicUser(['id'=>$id,'name'=>$name,'email'=>$email,'role'=>$role]);
    $pdo->commit(); session_regenerate_id(true); $_SESSION['csrf']=bin2hex(random_bytes(32));
    $_SESSION['user']=$user;
    if($user['role']==='elderly')recordUsage($pdo,$user['id']);
    respond(['user'=>$user,'csrf'=>$_SESSION['csrf']],201);
 }
 if ($method==='POST' && $action==='login') {
    $d=jsonBody(); $email=strtolower(trim((string)($d['email']??''))); $password=(string)($d['password']??'');
    $s=$pdo->prepare('SELECT id,name,email,password_hash,role FROM users WHERE email=?'); $s->execute([$email]); $u=$s->fetch();
    if (!$u || !password_verify($password,$u['password_hash'])) respond(['error'=>'E-mail ou senha incorretos.'],401);
    $user=publicUser($u);
    session_regenerate_id(true); $_SESSION['csrf']=bin2hex(random_bytes(32));
    $_SESSION['user']=$user;
    if($user['role']==='elderly')recordUsage($pdo,$user['id']);
    respond(['user'=>$user,'csrf'=>$_SESSION['csrf']]);
 }
 if ($method==='POST' && $action==='logout') { $_SESSION=[]; session_regenerate_id(true); $_SESSION['csrf']=bin2hex(random_bytes(32)); respond(['ok'=>true,'csrf'=>$_SESSION['csrf']]); }
 if ($method==='POST' && $action==='family-recovery-code') {
    $family=requireUser('family');
    $q=$pdo->prepare('SELECT elderly_id FROM family_links WHERE family_id=? LIMIT 1');
    $q->execute([$family['id']]); $elderId=(int)$q->fetchColumn();
    if(!$elderId)respond(['error'=>'Não há uma pessoa idosa vinculada a esta conta.'],404);
    $code=rtrim(strtr(base64_encode(random_bytes(12)),'+/','-_'),'=');
    $expires=gmdate('Y-m-d H:i:s',time()+1800);
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM family_password_recovery WHERE elderly_id=?')->execute([$elderId]);
    $pdo->prepare('INSERT INTO family_password_recovery(elderly_id,family_id,token_hash,expires_at) VALUES(?,?,?,?)')->execute([$elderId,$family['id'],hash('sha256',$code),$expires]);
    $pdo->commit();
    respond(['code'=>$code,'expires_at'=>$expires]);
 }
 if ($method==='POST' && $action==='recover-password') {
    $d=jsonBody();
    $email=strtolower(trim((string)($d['email']??'')));
    $code=trim((string)($d['code']??''));
    $password=(string)($d['password']??'');
    if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254)respond(['error'=>'Confira o e-mail, o código e a nova senha.'],422);
    if(strlen($password)<10||!preg_match('/[A-Za-z]/',$password)||!preg_match('/[0-9]/',$password))respond(['error'=>'A nova senha deve ter pelo menos 10 caracteres, com letras e números.'],422);
    if(!preg_match('/^[A-Za-z0-9_-]{16}$/',$code))respond(['error'=>'Confira o e-mail, o código e a nova senha.'],422);
    $pdo->beginTransaction();
    $q=$pdo->prepare("SELECT r.id,r.elderly_id FROM family_password_recovery r JOIN users u ON u.id=r.elderly_id JOIN family_links l ON l.elderly_id=r.elderly_id AND l.family_id=r.family_id WHERE u.email=? AND u.role='elderly' AND r.token_hash=? AND r.used_at IS NULL AND r.expires_at>? LIMIT 1 FOR UPDATE");
    $q->execute([$email,hash('sha256',$code),gmdate('Y-m-d H:i:s')]); $recovery=$q->fetch();
    if(!$recovery){$pdo->rollBack();respond(['error'=>'Não foi possível recuperar a conta. Confira o e-mail e o código, ou peça um novo código ao familiar.'],422);}
    $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),(int)$recovery['elderly_id']]);
    $pdo->prepare('UPDATE family_password_recovery SET used_at=? WHERE id=?')->execute([gmdate('Y-m-d H:i:s'),(int)$recovery['id']]);
    $pdo->commit();
    respond(['ok'=>true,'message'=>'Senha atualizada. Agora entre com sua nova senha.']);
 }
 if ($method==='POST' && $action==='invite') {
    $u=requireUser('elderly'); $code=strtoupper(bin2hex(random_bytes(6))); $expires=gmdate('Y-m-d H:i:s',time()+86400);
    $pdo->prepare('INSERT INTO family_invites(elderly_id,code_hash,expires_at) VALUES(?,?,?)')->execute([$u['id'],hash('sha256',$code),$expires]);
    respond(['code'=>$code,'expires_at'=>$expires]);
 }
 if ($method==='GET' && $action==='activities') { requireUser('elderly'); respond(['activities'=>activityRows($pdo)]); }
 if ($method==='POST' && in_array($action,['activity-progress','activity-complete'],true)) {
    $u=requireUser('elderly'); $d=jsonBody(); $id=(int)($d['activity_id']??0); $s=$pdo->prepare('SELECT id FROM activities WHERE id=? AND active=1'); $s->execute([$id]);
    if (!$s->fetch()) respond(['error'=>'Atividade não encontrada.'],404);
    $pdo->prepare('INSERT INTO activity_completions(user_id,activity_id) VALUES(?,?)')->execute([$u['id'],$id]);
    $pdo->prepare('INSERT INTO activity_progress(user_id,activity_id) VALUES(?,?) ON DUPLICATE KEY UPDATE completed_at=CURRENT_TIMESTAMP')->execute([$u['id'],$id]);
    recordUsage($pdo,(int)$u['id']); respond(['ok'=>true]);
 }
 if ($method==='GET' && $action==='activity-completions') {
    $u=requireUser('elderly');$q=$pdo->prepare('SELECT c.id,c.activity_id,c.completed_at,a.title,a.type,a.description FROM activity_completions c JOIN activities a ON a.id=c.activity_id WHERE c.user_id=? ORDER BY c.completed_at DESC,c.id DESC');$q->execute([$u['id']]);respond(['completions'=>$q->fetchAll()]);
 }
 if ($method==='GET' && $action==='usage-stats') {$u=requireUser('elderly');respond(['usage'=>usageStats($pdo,(int)$u['id'])]);}
 if ($method==='GET' && $action==='family-stats') {
    $u=requireUser('family');$q=$pdo->prepare('SELECT elderly_id FROM family_links WHERE family_id=?');$q->execute([$u['id']]);$elderId=$q->fetchColumn();
    if(!$elderId)respond(['error'=>'Não há uma conta idosa vinculada a este familiar.'],404);
    $q=$pdo->prepare('SELECT name FROM users WHERE id=?');$q->execute([$elderId]);$elder=$q->fetch();
    $done=$pdo->prepare('SELECT COUNT(*) FROM activity_completions WHERE user_id=?');$done->execute([$elderId]);
    respond(['elder'=>$elder,'usage'=>usageStats($pdo,(int)$elderId),'completed_activities'=>(int)$done->fetchColumn()]);
 }
 if ($method==='GET' && $action==='guides') {requireUser('elderly');respond(['guides'=>guideRows($pdo)]);}
 if ($method==='GET' && $action==='requests') { $u=requireUser(); respond(['requests'=>requestRows($pdo,$u)]); }
 if ($method==='POST' && $action==='requests') {
    $u=requireUser('elderly'); $d=jsonBody(); $category=cleanText($d['category']??'',60,'categoria'); $description=cleanText($d['description']??'',1200,'descrição');
    $pdo->prepare('INSERT INTO help_requests(user_id,category,description) VALUES(?,?,?)')->execute([$u['id'],$category,$description]);
    recordUsage($pdo,(int)$u['id']);respond(['ok'=>true],201);
 }
 if ($method==='POST' && $action==='request-update') {
    $admin=requireUser('admin');$d=jsonBody();$id=(int)($d['id']??0);$status=$d['status']??'';$response=trim((string)($d['response']??''));
    if(!in_array($status,['Pendente','Em análise','Atendido','Recusado'],true))respond(['error'=>'Status inválido.'],422);
    if($status==='Recusado'&&$response==='')respond(['error'=>'Informe o motivo da recusa para o idoso.'],422);
    $q=$pdo->prepare('SELECT id FROM help_requests WHERE id=?');$q->execute([$id]);if(!$q->fetch())respond(['error'=>'Pedido não encontrado.'],404);
    $pdo->prepare('UPDATE help_requests SET status=?,response=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$status,$response?:null,$id]);
    $pdo->prepare('INSERT INTO help_request_updates(request_id,author_id,status,message) VALUES(?,?,?,?)')->execute([$id,$admin['id'],$status,$response]);respond(['ok'=>true]);
 }
 if ($method==='POST' && $action==='family-request-update') {
    $family=requireUser('family');$d=jsonBody();$id=(int)($d['id']??0);$status=$d['status']??'';$message=cleanText($d['message']??'',1000,'mensagem');
    if(!in_array($status,['Em análise','Atendido'],true))respond(['error'=>'O familiar pode marcar o pedido em análise ou como atendido.'],422);
    $q=$pdo->prepare('SELECT h.id,h.status FROM help_requests h JOIN family_links l ON l.elderly_id=h.user_id WHERE h.id=? AND l.family_id=?');$q->execute([$id,$family['id']]);$linkedRequest=$q->fetch();if(!$linkedRequest)respond(['error'=>'Este pedido não pertence ao idoso vinculado a esta conta.'],403);if($linkedRequest['status']==='Recusado')respond(['error'=>'Este pedido foi recusado pela equipe e não pode ser alterado pelo familiar.'],409);
    $pdo->prepare('UPDATE help_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$status,$id]);
    $pdo->prepare('INSERT INTO help_request_updates(request_id,author_id,status,message) VALUES(?,?,?,?)')->execute([$id,$family['id'],$status,$message]);respond(['ok'=>true]);
 }
 if ($method==='POST' && $action==='activity-save') {
    $u=requireUser('admin');$id=(int)($_POST['id']??0);$type=$_POST['type']??'';
    if(!in_array($type,['puzzle','wordsearch'],true))respond(['error'=>'Tipo de atividade inválido.'],422);
    $title=cleanText($_POST['title']??'',100,'título');$description=cleanText($_POST['description']??'',500,'descrição');$words=[];$image=null;
    if($type==='wordsearch'){$raw=preg_split('/[,;\n]+/',strtoupper((string)($_POST['words']??'')));foreach($raw as $w){$w=preg_replace('/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/u','',trim($w));if(strlen($w)>=2)$words[]=$w;}$words=array_values(array_unique($words));if(count($words)<3||count($words)>12)respond(['error'=>'Informe de 3 a 12 palavras, separadas por vírgula.'],422);}
    if(isset($_FILES['image'])&&$_FILES['image']['error']!==UPLOAD_ERR_NO_FILE)$image=storeUpload($_FILES['image'],'image');
    if($id){$old=$pdo->prepare('SELECT image_path FROM activities WHERE id=?');$old->execute([$id]);$existing=$old->fetch();if(!$existing)respond(['error'=>'Atividade não encontrada.'],404);if(!$image)$image=$existing['image_path'];if($type==='puzzle'&&!$image)respond(['error'=>'Envie uma imagem para o quebra-cabeça.'],422);$pdo->prepare('UPDATE activities SET type=?,title=?,description=?,image_path=?,words_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$type,$title,$description,$type==='puzzle'?$image:null,$type==='wordsearch'?json_encode($words,JSON_UNESCAPED_UNICODE):null,$id]);}
    else{if($type==='puzzle'&&!$image)respond(['error'=>'Envie uma imagem para o quebra-cabeça.'],422);$pdo->prepare('INSERT INTO activities(type,title,description,image_path,words_json,created_by) VALUES(?,?,?,?,?,?)')->execute([$type,$title,$description,$type==='puzzle'?$image:null,$type==='wordsearch'?json_encode($words,JSON_UNESCAPED_UNICODE):null,$u['id']]);}
    respond(['ok'=>true]);
 }
 if ($method==='DELETE' && $action==='activity-delete') {
    requireUser('admin');$id=(int)($_GET['id']??0);$q=$pdo->prepare('SELECT image_path FROM activities WHERE id=?');$q->execute([$id]);$old=$q->fetch();if(!$old)respond(['error'=>'Atividade não encontrada.'],404);$pdo->prepare('DELETE FROM activities WHERE id=?')->execute([$id]);removeManagedUpload($old['image_path']);respond(['ok'=>true]);
 }
 if ($method==='POST' && $action==='guide-save') {
    $admin=requireUser('admin');$id=(int)($_POST['id']??0);$type=$_POST['type']??'';
    if(!in_array($type,['step','video'],true))respond(['error'=>'Tipo de guia inválido.'],422);
    $title=cleanText($_POST['title']??'',120,'título');$category=cleanText($_POST['category']??'',60,'categoria');$summary=cleanText($_POST['summary']??'',500,'resumo');$content=trim((string)($_POST['content']??''));
    if(mb_strlen($content)>12000)respond(['error'=>'O conteúdo do passo a passo deve ter até 12 mil caracteres.'],422);
    if($type==='step'&&$content==='')respond(['error'=>'Escreva os passos do guia.'],422);
    $oldPath=null;if($id){$q=$pdo->prepare('SELECT video_path FROM guides WHERE id=?');$q->execute([$id]);$old=$q->fetch();if(!$old)respond(['error'=>'Guia não encontrado.'],404);$oldPath=$old['video_path'];}
    $videoPath=$type==='video'?$oldPath:null;
    if($type==='video'&&isset($_FILES['video'])&&$_FILES['video']['error']!==UPLOAD_ERR_NO_FILE)$videoPath=storeUpload($_FILES['video'],'video');
    if($type==='video'&&!$videoPath)respond(['error'=>'Envie um vídeo MP4 ou WEBM para publicar.'],422);
    if($id)$pdo->prepare('UPDATE guides SET type=?,title=?,category=?,summary=?,content=?,video_path=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$type,$title,$category,$summary,$content,$videoPath,$id]);
    else $pdo->prepare('INSERT INTO guides(type,title,category,summary,content,video_path,created_by) VALUES(?,?,?,?,?,?,?)')->execute([$type,$title,$category,$summary,$content,$videoPath,$admin['id']]);
    if($oldPath&&$oldPath!==$videoPath)removeManagedUpload($oldPath);respond(['ok'=>true]);
 }
 if ($method==='DELETE' && $action==='guide-delete') {
    requireUser('admin');$id=(int)($_GET['id']??0);$q=$pdo->prepare('SELECT video_path FROM guides WHERE id=?');$q->execute([$id]);$guide=$q->fetch();if(!$guide)respond(['error'=>'Guia não encontrado.'],404);$pdo->prepare('DELETE FROM guides WHERE id=?')->execute([$id]);removeManagedUpload($guide['video_path']);respond(['ok'=>true]);
 }
 if ($method==='GET' && $action==='admin-data') {
    requireUser('admin');
    $counts=['users'=>(int)$pdo->query("SELECT COUNT(*) FROM users WHERE role<>'admin'")->fetchColumn(),'elderly'=>(int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='elderly'")->fetchColumn(),'families'=>(int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='family'")->fetchColumn(),'requests'=>(int)$pdo->query('SELECT COUNT(*) FROM help_requests')->fetchColumn()];
    $users=$pdo->query("SELECT id,name,email,role,created_at FROM users WHERE role<>'admin' ORDER BY created_at DESC")->fetchAll();
    respond(['counts'=>$counts,'activities'=>activityRows($pdo,true),'guides'=>guideRows($pdo),'users'=>$users]);
 }
 respond(['error'=>'Rota não encontrada.'],404);
} catch (Throwable $e) {
    error_log((string)$e);
    respond(['error'=>'Não foi possível concluir a operação. Tente novamente.'],500);
}
