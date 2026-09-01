# Store Listings — per-locale console fields (v0.2.0)

Copy-paste source for the store consoles. What lives where:

| Field | Source |
|---|---|
| Name / short description (<=132) | shipped in the build: `_locales/*/messages.json` |
| Detailed descriptions, 17 locales | `store-descriptions-chrome.md` (CWS/Edge, plain), `store-descriptions-firefox.md` (AMO, md) |
| Permission justifications, single purpose, data usage | `store-permissions.md` |
| Screenshots + banners | `../store-assets/` (`v0.2.0/` + `banners/optimized/`, NOTES/captions inside) |
| Screenshot captions, 17 locales | **below** (upload order: cf.png, cf-check.png, cf-purge.png, cf-profiles.png, cf-settings.png) |
| Edge (MPC) search terms, 17 locales | **below** — max 7 terms, 30 chars/term, 21 words total |

---

## AMO summary (<=250)

**EN**:
```
Bulk operations for Cloudflare zones from the sidebar: create, check, delete and purge many domains at once. API tokens or Global API Key, multiple profiles, session-encrypted credentials, zero tracking.
```

**RU**:
```
Массовые операции с зонами Cloudflare из сайдбара: создание, проверка, удаление, очистка кэша пачками. API-токены или Global API Key, несколько профилей, шифрование на время сессии, без трекинга.
```

## Release notes v0.2.0

**EN**
```
• API token support: user tokens (cfut_) and account-owned tokens (cfat_) alongside the Global API Key
• Multiple credential profiles with quick switching
• Toolbar button opens the panel directly (popup removed); quick actions moved into the panel
• "Select all" purge for a whole account and cross-account CSV export
• Opt-in publisher news (off by default, no identifiers sent)
• UI in English and Russian; localized store cards for 15 more languages
```

**RU**
```
• Поддержка API-токенов: пользовательские (cfut_) и токены аккаунта (cfat_) наряду с Global API Key
• Несколько профилей учётных данных с быстрым переключением
• Кнопка на панели инструментов открывает панель напрямую (попап удалён); быстрые действия переехали в панель
• «Выбрать все» для очистки кэша целого аккаунта и экспорт CSV по всем аккаунтам
• Новости издателя по явному включению (по умолчанию выключены, без идентификаторов)
• Интерфейс на английском и русском; карточки сторов локализованы ещё для 15 языков
```

---

# Screenshot captions & Edge search terms per locale

================================================================================
## English (en)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Bulk Create Zones: paste any list — preflight shows what will be created, duplicates and invalid entries
2. [cf-check.png] Check Zones: statuses per account, CSV export for one account or all at once
3. [cf-purge.png] Bulk Purge: Select all — every zone of the account ready for Purge Everything
4. [cf-profiles.png] Profiles: Global API Key, User Token and Account Token with one-click switch
5. [cf-settings.png] Settings: rate limits, theme, opt-in publisher news, dashboard integration

Edge search terms (7 terms, 18/21 words):
```
cloudflare bulk zones; bulk domain manager; purge cache; cloudflare api token; dns zones; bulk create domains; cloudflare accounts
```

================================================================================
## Russian (ru)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Массовое создание зон: вставьте любой список — предпроверка покажет, что будет создано, дубли и невалидные
2. [cf-check.png] Проверка зон: статусы по аккаунту, экспорт CSV одного или всех аккаунтов сразу
3. [cf-purge.png] Массовая очистка кэша: «Выбрать все» — все зоны аккаунта готовы к Purge Everything
4. [cf-profiles.png] Профили: Global API Key, пользовательский и аккаунт-токен с переключением в один клик
5. [cf-settings.png] Настройки: лимиты запросов, тема, opt-in новости издателя, интеграция с дашбордом

Edge search terms (6 terms, 15/21 words):
```
cloudflare массовые зоны; массовое добавление доменов; очистка кэша; api токен cloudflare; dns зоны; управление доменами
```

================================================================================
## German (de)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Massenanlage von Zonen: Liste einfügen — der Preflight zeigt Neuanlagen, Duplikate und ungültige Einträge
2. [cf-check.png] Zonen prüfen: Status je Konto, CSV-Export für ein Konto oder alle auf einmal
3. [cf-purge.png] Massen-Cache-Leerung: „Alle auswählen" — jede Zone des Kontos bereit für Purge Everything
4. [cf-profiles.png] Profile: Global API Key, Benutzer- und Konto-Token mit Wechsel per Klick
5. [cf-settings.png] Einstellungen: Rate-Limits, Theme, Opt-in-News des Herausgebers, Dashboard-Integration

Edge search terms (6 terms, 15/21 words):
```
cloudflare massen zonen; domains massenhaft anlegen; cache leeren; cloudflare api token; dns zonen; domain verwaltung
```

================================================================================
## Spanish (es)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Creación masiva de zonas: pega cualquier lista — la comprobación previa muestra qué se creará, duplicados e inválidos
2. [cf-check.png] Comprobar zonas: estados por cuenta, exportación CSV de una cuenta o de todas a la vez
3. [cf-purge.png] Purga masiva: Seleccionar todo — cada zona de la cuenta lista para Purge Everything
4. [cf-profiles.png] Perfiles: Global API Key, token de usuario y de cuenta con cambio en un clic
5. [cf-settings.png] Ajustes: límites de peticiones, tema, noticias opcionales del editor, integración con el panel

Edge search terms (6 terms, 17/21 words):
```
cloudflare zonas masivas; crear dominios en masa; purgar cache; token api cloudflare; zonas dns; gestion de dominios
```

================================================================================
## French (fr)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Création en masse : collez une liste — la pré-vérification montre créations, doublons et entrées invalides
2. [cf-check.png] Vérifier les zones : statuts par compte, export CSV d'un compte ou de tous à la fois
3. [cf-purge.png] Purge en masse : Tout sélectionner — chaque zone du compte prête pour Purge Everything
4. [cf-profiles.png] Profils : Global API Key, jeton utilisateur et jeton de compte, bascule en un clic
5. [cf-settings.png] Réglages : limites de requêtes, thème, actus éditeur en opt-in, intégration au tableau de bord

Edge search terms (6 terms, 17/21 words):
```
cloudflare zones en masse; creer domaines en masse; purger cache; jeton api cloudflare; zones dns; gestion domaines
```

================================================================================
## Portuguese — Brazil (pt_BR)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Criação em massa: cole qualquer lista — a pré-verificação mostra o que será criado, duplicados e inválidos
2. [cf-check.png] Verificar zonas: status por conta, exportação CSV de uma conta ou de todas de uma vez
3. [cf-purge.png] Limpeza em massa: Selecionar tudo — cada zona da conta pronta para o Purge Everything
4. [cf-profiles.png] Perfis: Global API Key, token de usuário e de conta com troca em um clique
5. [cf-settings.png] Configurações: limites de requisições, tema, notícias opt-in do editor, integração com o painel

Edge search terms (6 terms, 18/21 words):
```
cloudflare zonas em massa; criar dominios em massa; limpar cache; token api cloudflare; zonas dns; gestao de dominios
```

================================================================================
## Turkish (tr)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Toplu bölge oluşturma: listeyi yapıştırın — ön kontrol oluşturulacakları, kopyaları ve geçersizleri gösterir
2. [cf-check.png] Bölgeleri denetle: hesap başına durumlar, tek hesap veya tümü için CSV dışa aktarma
3. [cf-purge.png] Toplu önbellek temizliği: Tümünü seç — hesabın her bölgesi Purge Everything için hazır
4. [cf-profiles.png] Profiller: Global API Key, kullanıcı ve hesap belirteci, tek tıkla geçiş
5. [cf-settings.png] Ayarlar: istek limitleri, tema, isteğe bağlı yayıncı haberleri, panel entegrasyonu

Edge search terms (6 terms, 17/21 words):
```
cloudflare toplu bolge; toplu alan adi ekleme; onbellek temizleme; cloudflare api token; dns bolgeleri; alan adi yonetimi
```

================================================================================
## Japanese (ja)
================================================================================

Screenshot captions (upload order):
1. [cf.png] 一括ゾーン作成：リストを貼り付け — プリフライトが作成予定・重複・無効を表示
2. [cf-check.png] ゾーン確認：アカウント別ステータス、1アカウントまたは全アカウントをCSVエクスポート
3. [cf-purge.png] 一括パージ：全選択 — アカウントの全ゾーンをPurge Everythingへ
4. [cf-profiles.png] プロファイル：Global API Key・ユーザートークン・アカウントトークンをワンクリック切替
5. [cf-settings.png] 設定：レート制限、テーマ、オプトインのニュース、ダッシュボード連携

Edge search terms (7 terms, 9/21 words):
```
cloudflare 一括; ゾーン一括作成; キャッシュ削除; apiトークン; dns ゾーン; ドメイン管理; 一括登録
```

================================================================================
## Korean (ko)
================================================================================

Screenshot captions (upload order):
1. [cf.png] 일괄 존 생성: 목록을 붙여넣기 — 사전 점검이 생성 예정·중복·무효 항목을 표시
2. [cf-check.png] 존 확인: 계정별 상태, 한 계정 또는 전체를 CSV로 내보내기
3. [cf-purge.png] 일괄 퍼지: 전체 선택 — 계정의 모든 존을 Purge Everything으로
4. [cf-profiles.png] 프로필: Global API Key·사용자 토큰·계정 토큰을 원클릭 전환
5. [cf-settings.png] 설정: 요청 한도, 테마, 옵트인 게시자 소식, 대시보드 연동

Edge search terms (6 terms, 13/21 words):
```
cloudflare 일괄; 존 일괄 생성; 캐시 퍼지; api 토큰; dns 존; 도메인 관리
```

================================================================================
## Chinese Simplified (zh_CN)
================================================================================

Screenshot captions (upload order):
1. [cf.png] 批量创建区域：粘贴任意列表——预检显示将创建、重复与无效条目
2. [cf-check.png] 检查区域：按账户查看状态，导出单个或全部账户的 CSV
3. [cf-purge.png] 批量清缓存：全选——账户全部区域一键 Purge Everything
4. [cf-profiles.png] 配置文件：Global API Key、用户令牌与账户令牌，一键切换
5. [cf-settings.png] 设置：速率限制、主题、可选发布者动态、控制台集成

Edge search terms (7 terms, 8/21 words):
```
cloudflare 批量; 批量创建区域; 清除缓存; api令牌; dns区域; 域名管理; 批量域名
```

================================================================================
## Chinese Traditional (zh_TW)
================================================================================

Screenshot captions (upload order):
1. [cf.png] 批次建立區域：貼上任意清單——預檢顯示將建立、重複與無效項目
2. [cf-check.png] 檢查區域：依帳戶檢視狀態，匯出單一或全部帳戶的 CSV
3. [cf-purge.png] 批次清快取：全選——帳戶全部區域一鍵 Purge Everything
4. [cf-profiles.png] 設定檔：Global API Key、使用者權杖與帳戶權杖，一鍵切換
5. [cf-settings.png] 設定：速率限制、主題、可選發佈者動態、控制台整合

Edge search terms (7 terms, 8/21 words):
```
cloudflare 批次; 批次建立區域; 清除快取; api權杖; dns區域; 網域管理; 批次網域
```

================================================================================
## Indonesian (id)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Pembuatan zona massal: tempel daftar apa pun — pra-pemeriksaan menampilkan yang akan dibuat, duplikat, dan tidak valid
2. [cf-check.png] Periksa zona: status per akun, ekspor CSV satu akun atau semuanya sekaligus
3. [cf-purge.png] Purge massal: Pilih semua — setiap zona akun siap untuk Purge Everything
4. [cf-profiles.png] Profil: Global API Key, token pengguna dan token akun, beralih sekali klik
5. [cf-settings.png] Setelan: batas permintaan, tema, berita penerbit opt-in, integrasi dasbor

Edge search terms (6 terms, 15/21 words):
```
cloudflare zona massal; tambah domain massal; bersihkan cache; token api cloudflare; zona dns; kelola domain
```

================================================================================
## Vietnamese (vi)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Tạo zone hàng loạt: dán danh sách bất kỳ — kiểm tra trước hiển thị mục sẽ tạo, trùng lặp và không hợp lệ
2. [cf-check.png] Kiểm tra zone: trạng thái theo tài khoản, xuất CSV một hoặc tất cả tài khoản
3. [cf-purge.png] Xóa cache hàng loạt: Chọn tất cả — mọi zone của tài khoản sẵn sàng Purge Everything
4. [cf-profiles.png] Hồ sơ: Global API Key, token người dùng và token tài khoản, chuyển bằng một cú nhấp
5. [cf-settings.png] Cài đặt: giới hạn yêu cầu, chủ đề, tin tức opt-in, tích hợp bảng điều khiển

Edge search terms (6 terms, 18/21 words):
```
cloudflare zone hang loat; them domain hang loat; xoa cache; api token cloudflare; zone dns; quan ly domain
```

================================================================================
## Thai (th)
================================================================================

Screenshot captions (upload order):
1. [cf.png] สร้างโซนแบบชุด: วางรายการใดก็ได้ — การตรวจล่วงหน้าแสดงสิ่งที่จะสร้าง รายการซ้ำ และไม่ถูกต้อง
2. [cf-check.png] ตรวจสอบโซน: สถานะตามบัญชี ส่งออก CSV หนึ่งบัญชีหรือทั้งหมดพร้อมกัน
3. [cf-purge.png] ล้างแคชแบบชุด: เลือกทั้งหมด — ทุกโซนของบัญชีพร้อมสำหรับ Purge Everything
4. [cf-profiles.png] โปรไฟล์: Global API Key โทเคนผู้ใช้และโทเคนบัญชี สลับได้ในคลิกเดียว
5. [cf-settings.png] ตั้งค่า: ขีดจำกัดคำขอ ธีม ข่าวผู้เผยแพร่แบบสมัครใจ การเชื่อมต่อแดชบอร์ด

Edge search terms (6 terms, 9/21 words):
```
cloudflare โซนแบบชุด; เพิ่มโดเมนจำนวนมาก; ล้างแคช; api โทเคน; โซน dns; จัดการโดเมน
```

================================================================================
## Hindi (hi)
================================================================================

Screenshot captions (upload order):
1. [cf.png] बल्क ज़ोन निर्माण: कोई भी सूची पेस्ट करें — प्रीफ़्लाइट दिखाता है क्या बनेगा, डुप्लिकेट और अमान्य
2. [cf-check.png] ज़ोन जाँच: प्रति खाता स्थिति, एक या सभी खातों का CSV निर्यात
3. [cf-purge.png] बल्क पर्ज: सभी चुनें — खाते का हर ज़ोन Purge Everything के लिए तैयार
4. [cf-profiles.png] प्रोफ़ाइल: Global API Key, उपयोगकर्ता व खाता टोकन, एक क्लिक में स्विच
5. [cf-settings.png] सेटिंग्स: अनुरोध सीमाएँ, थीम, ऑप्ट-इन प्रकाशक समाचार, डैशबोर्ड एकीकरण

Edge search terms (6 terms, 15/21 words):
```
cloudflare बल्क जोन; बल्क डोमेन जोड़ें; कैश साफ़ करें; api टोकन; dns जोन; डोमेन प्रबंधन
```

================================================================================
## Polish (pl)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Masowe tworzenie stref: wklej dowolną listę — wstępna kontrola pokaże, co powstanie, duplikaty i błędne wpisy
2. [cf-check.png] Sprawdzanie stref: statusy według konta, eksport CSV jednego konta lub wszystkich naraz
3. [cf-purge.png] Masowe czyszczenie cache: Zaznacz wszystko — każda strefa konta gotowa na Purge Everything
4. [cf-profiles.png] Profile: Global API Key, token użytkownika i konta, przełączanie jednym kliknięciem
5. [cf-settings.png] Ustawienia: limity żądań, motyw, opcjonalne wiadomości wydawcy, integracja z panelem

Edge search terms (6 terms, 15/21 words):
```
cloudflare strefy masowo; masowe dodawanie domen; czyszczenie cache; token api cloudflare; strefy dns; zarzadzanie domenami
```

================================================================================
## Italian (it)
================================================================================

Screenshot captions (upload order):
1. [cf.png] Creazione zone in blocco: incolla qualsiasi lista — il preflight mostra cosa verrà creato, duplicati e voci non valide
2. [cf-check.png] Verifica zone: stati per account, esportazione CSV di un account o di tutti insieme
3. [cf-purge.png] Purge in blocco: Seleziona tutto — ogni zona dell'account pronta per Purge Everything
4. [cf-profiles.png] Profili: Global API Key, token utente e token account con cambio in un clic
5. [cf-settings.png] Impostazioni: limiti richieste, tema, notizie opt-in dell'editore, integrazione dashboard

Edge search terms (6 terms, 17/21 words):
```
cloudflare zone in blocco; creare domini in blocco; svuota cache; token api cloudflare; zone dns; gestione domini
```

