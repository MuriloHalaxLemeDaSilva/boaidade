# Boa Idade — PHP e MySQL

Portal responsivo com API PHP 8.1+ e banco MySQL 8.0.16+ via PDO. O esquema é criado automaticamente na primeira chamada à API; nenhum banco existente é apagado. O pacote inclui Docker Compose para iniciar aplicação e banco juntos.

## Iniciar com Docker Compose (recomendado)

Requer Docker Engine e o plugin `docker compose`. Na pasta do projeto:

```bash
cp .env.example .env
# Edite .env e substitua todas as senhas de exemplo por valores fortes
# Configure ADMIN_EMAIL e ADMIN_PASSWORD antes do primeiro início
docker compose up --build -d
```

Acesse `http://localhost:8080`. O MySQL guarda seus dados em um volume Docker persistente e espera ficar pronto antes de iniciar a aplicação. Para parar sem apagar os dados, execute `docker compose down`. **Não execute `docker compose down -v`** a menos que queira apagar o volume e todos os dados do banco.

O administrador inicial, atividades e guias de exemplo são criados na primeira execução. A senha de administrador só é usada ao criar a conta pela primeira vez; alterá-la posteriormente no `.env` não troca a senha já armazenada.

## Executar sem Docker

Requisitos: PHP 8.1+ com `pdo_mysql`, `mbstring` e `fileinfo`, e MySQL 8.0.16+.

1. Crie o banco e um usuário dedicado (substitua a senha):

```sql
CREATE DATABASE app_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'boaidade'@'localhost' IDENTIFIED BY 'TroqueEstaSenhaForte';
GRANT ALL PRIVILEGES ON app_db.* TO 'boaidade'@'localhost';
```

2. Configure o ambiente no mesmo terminal do servidor PHP:

```bash
export DB_DSN='mysql:host=127.0.0.1;port=3306;dbname=app_db;charset=utf8mb4'
export DB_USER='boaidade'
export DB_PASSWORD='TroqueEstaSenhaForte'
export ADMIN_EMAIL='admin@example.com'
export ADMIN_PASSWORD='DefinaUmaSenhaForte123'
php -d upload_max_filesize=52M -d post_max_size=55M -S 127.0.0.1:8000 router.php
```

Abra `http://127.0.0.1:8000`. O usuário MySQL precisa de permissão para criar tabelas e índices durante a inicialização. Alternativamente, depois de criar o banco, importe `database.sql` manualmente.

No Ubuntu/Debian, `./instalar-php-ubuntu.sh` instala PHP CLI e as extensões requeridas. O servidor MySQL precisa ser instalado/iniciado separadamente quando não usar Docker.

## Recursos e segurança

- Cadastro de idosos e familiares com vínculo de convite de uso único.
- Recuperação de senha do idoso iniciada pelo familiar já vinculado, com código de uso único válido por 30 minutos; o idoso define a nova senha e o familiar nunca a visualiza.
- Atividades, progresso, guias e solicitações de ajuda persistidos no MySQL.
- Senhas protegidas com `password_hash`, consultas preparadas, sessão segura e token CSRF.
- Use HTTPS em produção, usuário MySQL dedicado e credenciais fortes. Não exponha `database.sql`, `bootstrap.php`, arquivos `.env` nem uploads privados.
- Uploads administrativos aceitam imagens até 5 MB e vídeos MP4/WEBM até 50 MB; limites correspondentes estão configurados no comando de execução local e devem ser ajustados no servidor web de produção.

## Arquivos importantes

- `api.php`: API e autorização por perfil.
- `bootstrap.php`: conexão PDO MySQL, inicialização do esquema e dados iniciais.
- `database.sql`: esquema MySQL.
- `docker-compose.yml`: aplicação e serviço MySQL.
- `router.php`: roteamento local.
- `uploads/`: mídias enviadas pelo administrador.

Este pacote anteriormente usava SQLite. A versão MySQL não importa automaticamente o banco SQLite antigo. Se houver dados importantes nele, faça a migração de dados antes de descartar o banco antigo. A imagem SQLite incluída no ZIP original foi removida da versão convertida para evitar confusão com o novo banco.
