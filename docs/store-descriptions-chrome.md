# Store Descriptions — Chrome Web Store / Edge Add-ons
# Plain text formatting (no markdown)
# Copy each section as-is


================================================================================
## English (en)
================================================================================

Cloudflare Tools turns repetitive Cloudflare dashboard work into batch jobs — right in the browser side panel, talking directly to the Cloudflare API with no middleman servers.

USE CASES

• Add dozens or hundreds of domains to Cloudflare in one paste
• Purge cache for a whole account before a big rollout
• Audit zone statuses across accounts and export them to CSV
• Clean up unused zones in one pass
• Work with several Cloudflare accounts side by side via credential profiles

FEATURES

• Bulk Create: paste domains, URLs or any text — the parser extracts valid domains (IDN supported); preflight shows what will be created, what exists, duplicates and invalid entries
• Batches with progress, ETA, pause/resume and retry of failed items
• Check: zone list per account; CSV export for one account or for ALL accounts at once
• Bulk Delete with multi-select and confirmation
• Bulk Purge: "Purge Everything" for selected zones or a whole account in one click
• Profiles: user API tokens (cfut_), account-owned tokens (cfat_) or the classic Global API Key — the type is auto-detected from the pasted secret
• English and Russian UI; dark, light and system themes

PRIVACY & SAFETY

• Credentials are encrypted with AES-256-GCM; the key lives only in the browser session
• Every request goes straight to api.cloudflare.com; zero analytics, zero tracking
• Rate-limit aware: automatic backoff, Retry-After support, resumable batches
• The optional publisher news feed is strictly opt-in and sends no identifiers

TIP: for zone creation an API token only needs the "Zone → Zone → Edit" permission on your account — no Global API Key required.

Open source: github.com/investblog/cloudflare-tools
By the makers of 301.st — redirects, TDS & domain management.


================================================================================
## Russian (ru)
================================================================================

Cloudflare Tools превращает рутину дашборда Cloudflare в пакетные задачи — прямо в боковой панели браузера, напрямую через API Cloudflare, без серверов-посредников.

СЦЕНАРИИ

• Добавить в Cloudflare десятки и сотни доменов одной вставкой
• Очистить кэш целого аккаунта перед большим релизом
• Проверить статусы зон по аккаунтам и выгрузить их в CSV
• Удалить неиспользуемые зоны за один проход
• Работать с несколькими аккаунтами Cloudflare параллельно через профили учётных данных

ВОЗМОЖНОСТИ

• Массовое создание: вставьте домены, URL или любой текст — парсер извлечёт валидные домены (включая IDN); предпроверка покажет, что будет создано, что уже существует, дубли и невалидные записи
• Батчи с прогрессом, ETA, паузой/продолжением и повтором неудачных
• Проверка: список зон по аккаунту; экспорт CSV по одному аккаунту или сразу по ВСЕМ
• Массовое удаление с мультивыбором и подтверждением
• Массовая очистка кэша: «Purge Everything» для выбранных зон или всего аккаунта одним кликом
• Профили: пользовательские API-токены (cfut_), токены аккаунта (cfat_) или классический Global API Key — тип определяется автоматически по вставленному секрету
• Интерфейс на английском и русском; тёмная, светлая и системная темы

ПРИВАТНОСТЬ И БЕЗОПАСНОСТЬ

• Учётные данные шифруются AES-256-GCM; ключ живёт только в сессии браузера
• Каждый запрос идёт напрямую в api.cloudflare.com; ноль аналитики и трекинга
• Уважает лимиты API: автоматический backoff, поддержка Retry-After, возобновляемые батчи
• Опциональная лента новостей издателя включается только вручную и не передаёт идентификаторов

СОВЕТ: для создания зон API-токену достаточно права «Zone → Zone → Edit» на аккаунт — Global API Key не обязателен.

Открытый код: github.com/investblog/cloudflare-tools
От создателей 301.st — редиректы, TDS и управление доменами.


================================================================================
## German (de)
================================================================================

Cloudflare Tools verwandelt repetitive Dashboard-Arbeit in Batch-Jobs — direkt in der Seitenleiste des Browsers, über die Cloudflare-API und ohne zwischengeschaltete Server.

ANWENDUNGSFÄLLE

• Dutzende oder Hunderte Domains mit einem Einfügen zu Cloudflare hinzufügen
• Den Cache eines ganzen Kontos vor einem großen Rollout leeren
• Zonenstatus über Konten hinweg prüfen und als CSV exportieren
• Ungenutzte Zonen in einem Durchgang aufräumen
• Mehrere Cloudflare-Konten parallel über Anmeldeprofile verwalten

FUNKTIONEN

• Massenanlage: Domains, URLs oder beliebigen Text einfügen — der Parser extrahiert gültige Domains (inkl. IDN); der Preflight zeigt, was angelegt wird, was existiert, Duplikate und ungültige Einträge
• Batches mit Fortschritt, ETA, Pause/Fortsetzen und Wiederholung fehlgeschlagener Einträge
• Prüfen: Zonenliste je Konto; CSV-Export für ein Konto oder ALLE Konten auf einmal
• Massenlöschung mit Mehrfachauswahl und Bestätigung
• Massen-Cache-Leerung: „Purge Everything" für ausgewählte Zonen oder ein ganzes Konto mit einem Klick
• Profile: Benutzer-API-Tokens (cfut_), kontoeigene Tokens (cfat_) oder der klassische Global API Key — der Typ wird automatisch erkannt
• Oberfläche auf Englisch und Russisch; dunkles, helles und System-Theme

DATENSCHUTZ & SICHERHEIT

• Zugangsdaten werden mit AES-256-GCM verschlüsselt; der Schlüssel existiert nur in der Browser-Sitzung
• Jede Anfrage geht direkt an api.cloudflare.com; keine Analytik, kein Tracking
• Rate-Limit-bewusst: automatischer Backoff, Retry-After-Unterstützung, fortsetzbare Batches
• Der optionale Publisher-News-Feed ist strikt Opt-in und sendet keine Kennungen

TIPP: Zum Anlegen von Zonen genügt einem API-Token die Berechtigung „Zone → Zone → Edit" auf dem Konto — kein Global API Key nötig.

Open Source: github.com/investblog/cloudflare-tools
Von den Machern von 301.st — Redirects, TDS & Domain-Management.


================================================================================
## Spanish (es)
================================================================================

Cloudflare Tools convierte el trabajo repetitivo del panel de Cloudflare en tareas por lotes — directamente en la barra lateral del navegador, hablando con la API de Cloudflare sin servidores intermediarios.

CASOS DE USO

• Añadir decenas o cientos de dominios a Cloudflare con un solo pegado
• Purgar la caché de una cuenta completa antes de un gran despliegue
• Auditar el estado de las zonas entre cuentas y exportarlo a CSV
• Limpiar zonas sin uso en una sola pasada
• Trabajar con varias cuentas de Cloudflare en paralelo mediante perfiles de credenciales

FUNCIONES

• Creación masiva: pega dominios, URLs o cualquier texto — el parser extrae dominios válidos (IDN incluido); la comprobación previa muestra qué se creará, qué ya existe, duplicados y entradas inválidas
• Lotes con progreso, ETA, pausa/reanudación y reintento de fallos
• Comprobar: lista de zonas por cuenta; exportación CSV de una cuenta o de TODAS a la vez
• Borrado masivo con selección múltiple y confirmación
• Purga masiva: "Purge Everything" para las zonas seleccionadas o una cuenta entera con un clic
• Perfiles: tokens de API de usuario (cfut_), tokens de cuenta (cfat_) o la clásica Global API Key — el tipo se detecta automáticamente
• Interfaz en inglés y ruso; temas oscuro, claro y del sistema

PRIVACIDAD Y SEGURIDAD

• Las credenciales se cifran con AES-256-GCM; la clave vive solo en la sesión del navegador
• Cada petición va directa a api.cloudflare.com; cero analítica, cero rastreo
• Respeta los límites de la API: backoff automático, soporte de Retry-After, lotes reanudables
• Las noticias del editor son estrictamente opcionales y no envían identificadores

CONSEJO: para crear zonas, a un token de API le basta el permiso "Zone → Zone → Edit" sobre la cuenta — no hace falta la Global API Key.

Código abierto: github.com/investblog/cloudflare-tools
De los creadores de 301.st — redirecciones, TDS y gestión de dominios.


================================================================================
## French (fr)
================================================================================

Cloudflare Tools transforme le travail répétitif du tableau de bord Cloudflare en tâches par lots — directement dans le panneau latéral du navigateur, en parlant à l'API Cloudflare sans serveurs intermédiaires.

CAS D'USAGE

• Ajouter des dizaines ou des centaines de domaines à Cloudflare en un seul collage
• Purger le cache d'un compte entier avant un gros déploiement
• Auditer le statut des zones entre comptes et les exporter en CSV
• Nettoyer les zones inutilisées en un seul passage
• Gérer plusieurs comptes Cloudflare en parallèle via des profils d'identifiants

FONCTIONNALITÉS

• Création en masse : collez des domaines, des URL ou n'importe quel texte — le parseur extrait les domaines valides (IDN inclus) ; la pré-vérification montre ce qui sera créé, ce qui existe, les doublons et les entrées invalides
• Lots avec progression, ETA, pause/reprise et nouvelle tentative des échecs
• Vérifier : liste des zones par compte ; export CSV d'un compte ou de TOUS les comptes à la fois
• Suppression en masse avec sélection multiple et confirmation
• Purge en masse : « Purge Everything » pour les zones sélectionnées ou un compte entier en un clic
• Profils : jetons API utilisateur (cfut_), jetons de compte (cfat_) ou la classique Global API Key — le type est détecté automatiquement
• Interface en anglais et en russe ; thèmes sombre, clair et système

CONFIDENTIALITÉ & SÉCURITÉ

• Les identifiants sont chiffrés en AES-256-GCM ; la clé ne vit que dans la session du navigateur
• Chaque requête va directement à api.cloudflare.com ; zéro analytique, zéro pistage
• Respecte les limites de l'API : backoff automatique, prise en charge de Retry-After, lots reprenables
• Le fil d'actualités de l'éditeur est strictement opt-in et n'envoie aucun identifiant

ASTUCE : pour créer des zones, un jeton API n'a besoin que de la permission « Zone → Zone → Edit » sur le compte — pas de Global API Key requise.

Open source : github.com/investblog/cloudflare-tools
Par les créateurs de 301.st — redirections, TDS et gestion de domaines.


================================================================================
## Portuguese — Brazil (pt_BR)
================================================================================

O Cloudflare Tools transforma o trabalho repetitivo do painel da Cloudflare em tarefas em lote — direto no painel lateral do navegador, falando com a API da Cloudflare sem servidores intermediários.

CASOS DE USO

• Adicionar dezenas ou centenas de domínios à Cloudflare com uma única colagem
• Limpar o cache de uma conta inteira antes de um grande lançamento
• Auditar o status das zonas entre contas e exportar para CSV
• Remover zonas sem uso em uma única passada
• Trabalhar com várias contas Cloudflare em paralelo via perfis de credenciais

RECURSOS

• Criação em massa: cole domínios, URLs ou qualquer texto — o parser extrai domínios válidos (IDN incluído); a pré-verificação mostra o que será criado, o que já existe, duplicados e entradas inválidas
• Lotes com progresso, ETA, pausar/retomar e nova tentativa das falhas
• Verificar: lista de zonas por conta; exportação CSV de uma conta ou de TODAS de uma vez
• Exclusão em massa com seleção múltipla e confirmação
• Limpeza em massa: "Purge Everything" para as zonas selecionadas ou uma conta inteira em um clique
• Perfis: tokens de API de usuário (cfut_), tokens de conta (cfat_) ou a clássica Global API Key — o tipo é detectado automaticamente
• Interface em inglês e russo; temas escuro, claro e do sistema

PRIVACIDADE E SEGURANÇA

• As credenciais são criptografadas com AES-256-GCM; a chave vive apenas na sessão do navegador
• Cada requisição vai direto para api.cloudflare.com; zero análises, zero rastreamento
• Respeita os limites da API: backoff automático, suporte a Retry-After, lotes retomáveis
• O feed opcional de notícias do editor é estritamente opt-in e não envia identificadores

DICA: para criar zonas, um token de API precisa apenas da permissão "Zone → Zone → Edit" na conta — Global API Key não é necessária.

Código aberto: github.com/investblog/cloudflare-tools
Dos criadores do 301.st — redirecionamentos, TDS e gestão de domínios.


================================================================================
## Turkish (tr)
================================================================================

Cloudflare Tools, tekrar eden panel işlerini toplu görevlere dönüştürür — doğrudan tarayıcının yan panelinde, aracı sunucular olmadan Cloudflare API ile konuşarak.

KULLANIM SENARYOLARI

• Tek yapıştırmayla Cloudflare'a onlarca veya yüzlerce alan adı ekleyin
• Büyük bir yayın öncesi tüm hesabın önbelleğini temizleyin
• Hesaplar arasında bölge durumlarını denetleyin ve CSV olarak dışa aktarın
• Kullanılmayan bölgeleri tek seferde temizleyin
• Kimlik profilleriyle birden çok Cloudflare hesabını yan yana yönetin

ÖZELLİKLER

• Toplu oluşturma: alan adlarını, URL'leri veya herhangi bir metni yapıştırın — ayrıştırıcı geçerli alan adlarını çıkarır (IDN dahil); ön kontrol neyin oluşturulacağını, neyin var olduğunu, kopyaları ve geçersiz girdileri gösterir
• İlerleme, ETA, duraklat/sürdür ve başarısızları yeniden deneme ile toplu işler
• Denetim: hesap başına bölge listesi; tek hesap veya TÜM hesaplar için CSV dışa aktarma
• Çoklu seçim ve onay ile toplu silme
• Toplu önbellek temizleme: seçili bölgeler veya tüm hesap için tek tıkla "Purge Everything"
• Profiller: kullanıcı API belirteçleri (cfut_), hesaba ait belirteçler (cfat_) veya klasik Global API Key — tür otomatik algılanır
• İngilizce ve Rusça arayüz; koyu, açık ve sistem temaları

GİZLİLİK VE GÜVENLİK

• Kimlik bilgileri AES-256-GCM ile şifrelenir; anahtar yalnızca tarayıcı oturumunda yaşar
• Her istek doğrudan api.cloudflare.com'a gider; sıfır analitik, sıfır izleme
• API limitlerine saygılı: otomatik backoff, Retry-After desteği, sürdürülebilir toplu işler
• İsteğe bağlı yayıncı haberleri kesinlikle opt-in'dir ve hiçbir kimlik göndermez

İPUCU: bölge oluşturmak için bir API belirtecine hesapta yalnızca "Zone → Zone → Edit" izni yeter — Global API Key gerekmez.

Açık kaynak: github.com/investblog/cloudflare-tools
301.st ekibinden — yönlendirmeler, TDS ve alan adı yönetimi.


================================================================================
## Japanese (ja)
================================================================================

Cloudflare Toolsは、繰り返しのダッシュボード作業をバッチ処理に変えます。ブラウザのサイドパネルから、仲介サーバーなしでCloudflare APIと直接通信します。

ユースケース

• 数十〜数百のドメインを一度の貼り付けでCloudflareに追加
• 大規模リリース前にアカウント全体のキャッシュをパージ
• アカウント横断でゾーンの状態を確認しCSVにエクスポート
• 不要なゾーンを一括で整理
• 認証プロファイルで複数のCloudflareアカウントを並行運用

機能

• 一括作成：ドメイン、URL、任意のテキストを貼り付けるだけ — パーサーが有効なドメインを抽出（IDN対応）。プリフライトで作成予定・既存・重複・無効を表示
• 進捗・ETA・一時停止/再開・失敗分の再試行に対応したバッチ
• 確認：アカウントごとのゾーン一覧。1アカウントまたは全アカウントを一括CSVエクスポート
• 複数選択と確認付きの一括削除
• 一括パージ：選択ゾーンまたはアカウント全体を1クリックで「Purge Everything」
• プロファイル：ユーザーAPIトークン（cfut_）、アカウント所有トークン（cfat_）、従来のGlobal API Key — 種類は自動判別
• UIは英語とロシア語。ダーク／ライト／システムテーマ

プライバシーとセキュリティ

• 認証情報はAES-256-GCMで暗号化。鍵はブラウザセッション内にのみ存在
• すべてのリクエストはapi.cloudflare.comへ直接送信。解析・トラッキングはゼロ
• レート制限に配慮：自動バックオフ、Retry-After対応、再開可能なバッチ
• 任意の運営ニュースは完全オプトインで、識別子は送信しません

ヒント：ゾーン作成にはAPIトークンにアカウントの「Zone → Zone → Edit」権限があれば十分です。Global API Keyは不要です。

オープンソース：github.com/investblog/cloudflare-tools
301.st のチームより — リダイレクト、TDS、ドメイン管理。


================================================================================
## Korean (ko)
================================================================================

Cloudflare Tools는 반복적인 대시보드 작업을 일괄 작업으로 바꿉니다. 브라우저 사이드 패널에서 중개 서버 없이 Cloudflare API와 직접 통신합니다.

사용 사례

• 한 번의 붙여넣기로 수십~수백 개의 도메인을 Cloudflare에 추가
• 대규모 배포 전에 계정 전체 캐시 퍼지
• 계정 전반의 존 상태를 점검하고 CSV로 내보내기
• 사용하지 않는 존을 한 번에 정리
• 자격 증명 프로필로 여러 Cloudflare 계정을 나란히 관리

기능

• 일괄 생성: 도메인, URL, 아무 텍스트나 붙여넣기 — 파서가 유효한 도메인을 추출(IDN 지원). 사전 점검이 생성 예정/기존/중복/무효 항목을 표시
• 진행률, ETA, 일시정지/재개, 실패 항목 재시도를 갖춘 배치
• 확인: 계정별 존 목록. 한 계정 또는 모든 계정을 한 번에 CSV로 내보내기
• 다중 선택과 확인이 있는 일괄 삭제
• 일괄 퍼지: 선택한 존 또는 계정 전체를 한 번의 클릭으로 "Purge Everything"
• 프로필: 사용자 API 토큰(cfut_), 계정 소유 토큰(cfat_), 기존 Global API Key — 유형 자동 감지
• 영어·러시아어 UI, 다크/라이트/시스템 테마

개인정보 보호 및 보안

• 자격 증명은 AES-256-GCM으로 암호화되며 키는 브라우저 세션에만 존재
• 모든 요청은 api.cloudflare.com으로 직접 전송. 분석·추적 없음
• 요청 한도 준수: 자동 백오프, Retry-After 지원, 재개 가능한 배치
• 선택적 게시자 소식은 철저히 옵트인이며 식별자를 보내지 않음

팁: 존 생성에는 API 토큰에 계정의 "Zone → Zone → Edit" 권한만 있으면 됩니다. Global API Key는 필요 없습니다.

오픈 소스: github.com/investblog/cloudflare-tools
301.st 팀 제작 — 리디렉션, TDS, 도메인 관리.


================================================================================
## Chinese Simplified (zh_CN)
================================================================================

Cloudflare Tools 把重复的控制台操作变成批量任务——就在浏览器侧边栏中，直接对接 Cloudflare API，没有任何中间服务器。

使用场景

• 一次粘贴即可向 Cloudflare 添加数十上百个域名
• 大规模上线前清空整个账户的缓存
• 跨账户核查区域状态并导出 CSV
• 一次性清理不再使用的区域
• 通过凭据配置文件并行管理多个 Cloudflare 账户

功能

• 批量创建：粘贴域名、URL 或任意文本——解析器提取有效域名（支持 IDN）；预检显示将创建、已存在、重复与无效条目
• 批任务带进度、ETA、暂停/继续以及失败重试
• 检查：按账户列出区域；可导出单个账户或一次性导出全部账户的 CSV
• 多选加确认的批量删除
• 批量清缓存：对所选区域或整个账户一键 "Purge Everything"
• 配置文件：用户 API 令牌（cfut_）、账户级令牌（cfat_）或经典 Global API Key——类型自动识别
• 界面支持英语和俄语；深色、浅色与跟随系统主题

隐私与安全

• 凭据使用 AES-256-GCM 加密；密钥仅存在于浏览器会话中
• 所有请求直达 api.cloudflare.com；零分析、零跟踪
• 尊重速率限制：自动退避、支持 Retry-After、批任务可恢复
• 可选的发布者动态严格为主动开启，且不发送任何标识符

提示：创建区域只需 API 令牌拥有账户的 "Zone → Zone → Edit" 权限——无需 Global API Key。

开源项目：github.com/investblog/cloudflare-tools
来自 301.st 团队——重定向、TDS 与域名管理。


================================================================================
## Chinese Traditional (zh_TW)
================================================================================

Cloudflare Tools 把重複的控制台操作變成批次任務——就在瀏覽器側邊欄中，直接對接 Cloudflare API，沒有任何中介伺服器。

使用情境

• 一次貼上即可向 Cloudflare 新增數十上百個網域
• 大規模上線前清空整個帳戶的快取
• 跨帳戶檢查區域狀態並匯出 CSV
• 一次清理不再使用的區域
• 透過憑證設定檔並行管理多個 Cloudflare 帳戶

功能

• 批次建立：貼上網域、URL 或任意文字——解析器擷取有效網域（支援 IDN）；預檢顯示將建立、已存在、重複與無效項目
• 批次任務具進度、ETA、暫停/繼續與失敗重試
• 檢查：依帳戶列出區域；可匯出單一帳戶或一次匯出全部帳戶的 CSV
• 多選加確認的批次刪除
• 批次清快取：對所選區域或整個帳戶一鍵 "Purge Everything"
• 設定檔：使用者 API 權杖（cfut_）、帳戶層權杖（cfat_）或傳統 Global API Key——類型自動辨識
• 介面支援英文與俄文；深色、淺色與跟隨系統主題

隱私與安全

• 憑證以 AES-256-GCM 加密；金鑰僅存在於瀏覽器工作階段
• 所有請求直達 api.cloudflare.com；零分析、零追蹤
• 尊重速率限制：自動退避、支援 Retry-After、批次可續跑
• 可選的發佈者動態嚴格採主動開啟，且不傳送任何識別碼

提示：建立區域只需 API 權杖擁有帳戶的 "Zone → Zone → Edit" 權限——無需 Global API Key。

開放原始碼：github.com/investblog/cloudflare-tools
來自 301.st 團隊——重新導向、TDS 與網域管理。


================================================================================
## Indonesian (id)
================================================================================

Cloudflare Tools mengubah pekerjaan dasbor yang berulang menjadi tugas massal — langsung di panel samping browser, berbicara langsung dengan API Cloudflare tanpa server perantara.

KASUS PENGGUNAAN

• Tambahkan puluhan atau ratusan domain ke Cloudflare dengan sekali tempel
• Bersihkan cache seluruh akun sebelum peluncuran besar
• Audit status zona lintas akun dan ekspor ke CSV
• Bersihkan zona yang tak terpakai dalam sekali jalan
• Kelola beberapa akun Cloudflare berdampingan lewat profil kredensial

FITUR

• Pembuatan massal: tempel domain, URL, atau teks apa pun — parser mengekstrak domain valid (mendukung IDN); pra-pemeriksaan menampilkan yang akan dibuat, yang sudah ada, duplikat, dan entri tidak valid
• Batch dengan progres, ETA, jeda/lanjut, dan coba ulang yang gagal
• Periksa: daftar zona per akun; ekspor CSV satu akun atau SEMUA akun sekaligus
• Hapus massal dengan multi-pilih dan konfirmasi
• Purge massal: "Purge Everything" untuk zona terpilih atau seluruh akun dalam satu klik
• Profil: token API pengguna (cfut_), token milik akun (cfat_), atau Global API Key klasik — tipe terdeteksi otomatis
• UI bahasa Inggris dan Rusia; tema gelap, terang, dan sistem

PRIVASI & KEAMANAN

• Kredensial dienkripsi dengan AES-256-GCM; kuncinya hanya hidup di sesi browser
• Setiap permintaan langsung ke api.cloudflare.com; nol analitik, nol pelacakan
• Menghormati batas laju: backoff otomatis, dukungan Retry-After, batch dapat dilanjutkan
• Berita penerbit bersifat opsional (opt-in) dan tidak mengirim pengenal apa pun

TIPS: untuk membuat zona, token API cukup punya izin "Zone → Zone → Edit" pada akun — tidak perlu Global API Key.

Sumber terbuka: github.com/investblog/cloudflare-tools
Dari pembuat 301.st — pengalihan, TDS & manajemen domain.


================================================================================
## Vietnamese (vi)
================================================================================

Cloudflare Tools biến các thao tác lặp lại trên bảng điều khiển thành tác vụ hàng loạt — ngay trong bảng bên của trình duyệt, nói chuyện trực tiếp với API Cloudflare, không qua máy chủ trung gian.

TRƯỜNG HỢP SỬ DỤNG

• Thêm hàng chục hoặc hàng trăm tên miền vào Cloudflare chỉ với một lần dán
• Xóa cache toàn bộ tài khoản trước một đợt phát hành lớn
• Kiểm tra trạng thái zone giữa các tài khoản và xuất ra CSV
• Dọn dẹp các zone không dùng trong một lượt
• Làm việc song song với nhiều tài khoản Cloudflare qua hồ sơ thông tin đăng nhập

TÍNH NĂNG

• Tạo hàng loạt: dán tên miền, URL hoặc bất kỳ văn bản nào — trình phân tích trích xuất tên miền hợp lệ (hỗ trợ IDN); kiểm tra trước cho biết sẽ tạo gì, cái gì đã tồn tại, trùng lặp và mục không hợp lệ
• Lô với tiến độ, ETA, tạm dừng/tiếp tục và thử lại mục lỗi
• Kiểm tra: danh sách zone theo tài khoản; xuất CSV một tài khoản hoặc TẤT CẢ cùng lúc
• Xóa hàng loạt với chọn nhiều và xác nhận
• Xóa cache hàng loạt: "Purge Everything" cho các zone đã chọn hoặc cả tài khoản trong một cú nhấp
• Hồ sơ: API token người dùng (cfut_), token thuộc tài khoản (cfat_) hoặc Global API Key cổ điển — loại được tự nhận diện
• Giao diện tiếng Anh và tiếng Nga; chủ đề tối, sáng và theo hệ thống

QUYỀN RIÊNG TƯ & BẢO MẬT

• Thông tin đăng nhập được mã hóa AES-256-GCM; khóa chỉ tồn tại trong phiên trình duyệt
• Mọi yêu cầu đi thẳng tới api.cloudflare.com; không phân tích, không theo dõi
• Tôn trọng giới hạn API: backoff tự động, hỗ trợ Retry-After, lô có thể tiếp tục
• Bản tin nhà phát hành là tùy chọn (opt-in) và không gửi bất kỳ định danh nào

MẸO: để tạo zone, API token chỉ cần quyền "Zone → Zone → Edit" trên tài khoản — không cần Global API Key.

Mã nguồn mở: github.com/investblog/cloudflare-tools
Từ đội ngũ 301.st — chuyển hướng, TDS và quản lý tên miền.


================================================================================
## Thai (th)
================================================================================

Cloudflare Tools เปลี่ยนงานแดชบอร์ดซ้ำ ๆ ให้เป็นงานแบบชุด — ในแผงด้านข้างของเบราว์เซอร์ คุยกับ Cloudflare API โดยตรง ไม่มีเซิร์ฟเวอร์คนกลาง

กรณีการใช้งาน

• เพิ่มโดเมนหลักสิบถึงหลักร้อยเข้า Cloudflare ด้วยการวางครั้งเดียว
• ล้างแคชทั้งบัญชีก่อนการเปิดตัวครั้งใหญ่
• ตรวจสอบสถานะโซนข้ามบัญชีและส่งออกเป็น CSV
• เก็บกวาดโซนที่ไม่ใช้แล้วในรอบเดียว
• ทำงานกับหลายบัญชี Cloudflare พร้อมกันผ่านโปรไฟล์ข้อมูลรับรอง

ฟีเจอร์

• สร้างแบบชุด: วางโดเมน URL หรือข้อความใดก็ได้ — ตัวแยกวิเคราะห์จะดึงโดเมนที่ถูกต้อง (รองรับ IDN); การตรวจสอบล่วงหน้าแสดงสิ่งที่จะสร้าง มีอยู่แล้ว ซ้ำ และไม่ถูกต้อง
• งานชุดพร้อมความคืบหน้า ETA หยุดชั่วคราว/ทำต่อ และลองใหม่รายการที่ล้มเหลว
• ตรวจสอบ: รายการโซนต่อบัญชี; ส่งออก CSV หนึ่งบัญชีหรือทุกบัญชีพร้อมกัน
• ลบแบบชุดด้วยการเลือกหลายรายการและการยืนยัน
• ล้างแคชแบบชุด: "Purge Everything" สำหรับโซนที่เลือกหรือทั้งบัญชีในคลิกเดียว
• โปรไฟล์: โทเคน API ผู้ใช้ (cfut_) โทเคนของบัญชี (cfat_) หรือ Global API Key แบบคลาสสิก — ตรวจจับชนิดอัตโนมัติ
• อินเทอร์เฟซภาษาอังกฤษและรัสเซีย; ธีมมืด สว่าง และตามระบบ

ความเป็นส่วนตัวและความปลอดภัย

• ข้อมูลรับรองเข้ารหัสด้วย AES-256-GCM; กุญแจอยู่เฉพาะในเซสชันเบราว์เซอร์
• ทุกคำขอส่งตรงไปยัง api.cloudflare.com; ไม่มีการวิเคราะห์ ไม่มีการติดตาม
• เคารพขีดจำกัดอัตรา: backoff อัตโนมัติ รองรับ Retry-After งานชุดกลับมาทำต่อได้
• ข่าวจากผู้เผยแพร่เป็นแบบสมัครใจเท่านั้นและไม่ส่งตัวระบุใด ๆ

เคล็ดลับ: การสร้างโซนต้องการเพียงสิทธิ์ "Zone → Zone → Edit" บนบัญชีสำหรับโทเคน API — ไม่ต้องใช้ Global API Key

โอเพนซอร์ส: github.com/investblog/cloudflare-tools
จากทีมผู้สร้าง 301.st — รีไดเรกต์ TDS และการจัดการโดเมน


================================================================================
## Hindi (hi)
================================================================================

Cloudflare Tools दोहराए जाने वाले डैशबोर्ड काम को बैच कार्यों में बदल देता है — सीधे ब्राउज़र के साइड पैनल में, बिना किसी बिचौलिया सर्वर के Cloudflare API से सीधे बात करते हुए।

उपयोग के मामले

• एक ही पेस्ट में दर्जनों या सैकड़ों डोमेन Cloudflare में जोड़ें
• बड़े रोलआउट से पहले पूरे खाते का कैश साफ़ करें
• खातों में ज़ोन की स्थिति जाँचें और CSV में निर्यात करें
• अप्रयुक्त ज़ोन एक ही बार में हटाएँ
• क्रेडेंशियल प्रोफ़ाइल के ज़रिये कई Cloudflare खातों के साथ साथ-साथ काम करें

विशेषताएँ

• बल्क निर्माण: डोमेन, URL या कोई भी टेक्स्ट पेस्ट करें — पार्सर वैध डोमेन निकालता है (IDN समर्थित); प्रीफ़्लाइट दिखाता है कि क्या बनेगा, क्या पहले से है, डुप्लिकेट और अमान्य प्रविष्टियाँ
• प्रगति, ETA, रोकें/जारी रखें और असफल प्रविष्टियों के पुनः प्रयास के साथ बैच
• जाँच: प्रति खाता ज़ोन सूची; एक खाते या एक साथ सभी खातों का CSV निर्यात
• मल्टी-सेलेक्ट और पुष्टि के साथ बल्क डिलीट
• बल्क पर्ज: चुने हुए ज़ोन या पूरे खाते के लिए एक क्लिक में "Purge Everything"
• प्रोफ़ाइल: उपयोगकर्ता API टोकन (cfut_), खाता-स्वामित्व टोकन (cfat_) या क्लासिक Global API Key — प्रकार अपने आप पहचाना जाता है
• अंग्रेज़ी और रूसी UI; डार्क, लाइट और सिस्टम थीम

गोपनीयता और सुरक्षा

• क्रेडेंशियल AES-256-GCM से एन्क्रिप्टेड; कुंजी केवल ब्राउज़र सेशन में रहती है
• हर अनुरोध सीधे api.cloudflare.com पर जाता है; कोई एनालिटिक्स नहीं, कोई ट्रैकिंग नहीं
• रेट-लिमिट का सम्मान: स्वचालित बैकऑफ़, Retry-After समर्थन, फिर से शुरू होने वाले बैच
• वैकल्पिक प्रकाशक समाचार पूरी तरह ऑप्ट-इन है और कोई पहचानकर्ता नहीं भेजता

सुझाव: ज़ोन बनाने के लिए API टोकन को खाते पर केवल "Zone → Zone → Edit" अनुमति चाहिए — Global API Key ज़रूरी नहीं।

ओपन सोर्स: github.com/investblog/cloudflare-tools
301.st के निर्माताओं की ओर से — रीडायरेक्ट, TDS और डोमेन प्रबंधन।


================================================================================
## Polish (pl)
================================================================================

Cloudflare Tools zamienia powtarzalną pracę w panelu w zadania wsadowe — bezpośrednio w panelu bocznym przeglądarki, komunikując się z API Cloudflare bez serwerów pośredniczących.

ZASTOSOWANIA

• Dodaj dziesiątki lub setki domen do Cloudflare jednym wklejeniem
• Wyczyść cache całego konta przed dużym wdrożeniem
• Sprawdź statusy stref w wielu kontach i wyeksportuj je do CSV
• Uporządkuj nieużywane strefy za jednym przebiegiem
• Pracuj równolegle z wieloma kontami Cloudflare dzięki profilom poświadczeń

FUNKCJE

• Masowe tworzenie: wklej domeny, adresy URL lub dowolny tekst — parser wyodrębni poprawne domeny (obsługa IDN); wstępna kontrola pokaże, co zostanie utworzone, co już istnieje, duplikaty i wpisy niepoprawne
• Zadania wsadowe z postępem, ETA, pauzą/wznowieniem i ponawianiem nieudanych
• Sprawdzanie: lista stref na konto; eksport CSV jednego konta lub WSZYSTKICH naraz
• Masowe usuwanie z wielokrotnym wyborem i potwierdzeniem
• Masowe czyszczenie cache: „Purge Everything" dla wybranych stref lub całego konta jednym kliknięciem
• Profile: tokeny API użytkownika (cfut_), tokeny konta (cfat_) lub klasyczny Global API Key — typ wykrywany automatycznie
• Interfejs po angielsku i rosyjsku; motyw ciemny, jasny i systemowy

PRYWATNOŚĆ I BEZPIECZEŃSTWO

• Poświadczenia są szyfrowane AES-256-GCM; klucz istnieje tylko w sesji przeglądarki
• Każde żądanie idzie prosto do api.cloudflare.com; zero analityki, zero śledzenia
• Respektuje limity API: automatyczny backoff, obsługa Retry-After, wznawialne zadania
• Opcjonalne wiadomości wydawcy są ściśle opt-in i nie wysyłają żadnych identyfikatorów

WSKAZÓWKA: do tworzenia stref token API potrzebuje tylko uprawnienia „Zone → Zone → Edit" na koncie — Global API Key nie jest wymagany.

Open source: github.com/investblog/cloudflare-tools
Od twórców 301.st — przekierowania, TDS i zarządzanie domenami.


================================================================================
## Italian (it)
================================================================================

Cloudflare Tools trasforma il lavoro ripetitivo della dashboard in operazioni in blocco — direttamente nel pannello laterale del browser, parlando con l'API di Cloudflare senza server intermediari.

CASI D'USO

• Aggiungi decine o centinaia di domini a Cloudflare con un solo incolla
• Svuota la cache di un intero account prima di un grande rilascio
• Verifica lo stato delle zone tra gli account ed esportalo in CSV
• Ripulisci le zone inutilizzate in un solo passaggio
• Gestisci più account Cloudflare in parallelo con i profili di credenziali

FUNZIONALITÀ

• Creazione in blocco: incolla domini, URL o qualsiasi testo — il parser estrae i domini validi (IDN incluso); il preflight mostra cosa verrà creato, cosa esiste già, duplicati e voci non valide
• Batch con avanzamento, ETA, pausa/ripresa e nuovo tentativo dei falliti
• Verifica: elenco zone per account; esportazione CSV di un account o di TUTTI in una volta
• Eliminazione in blocco con selezione multipla e conferma
• Purge in blocco: "Purge Everything" per le zone selezionate o un intero account con un clic
• Profili: token API utente (cfut_), token di account (cfat_) o la classica Global API Key — il tipo viene rilevato automaticamente
• Interfaccia in inglese e russo; temi scuro, chiaro e di sistema

PRIVACY E SICUREZZA

• Le credenziali sono cifrate con AES-256-GCM; la chiave vive solo nella sessione del browser
• Ogni richiesta va direttamente ad api.cloudflare.com; zero analisi, zero tracciamento
• Rispetta i limiti dell'API: backoff automatico, supporto Retry-After, batch riprendibili
• Le notizie dell'editore sono strettamente opt-in e non inviano identificatori

SUGGERIMENTO: per creare zone a un token API basta il permesso "Zone → Zone → Edit" sull'account — la Global API Key non serve.

Open source: github.com/investblog/cloudflare-tools
Dai creatori di 301.st — redirect, TDS e gestione domini.

