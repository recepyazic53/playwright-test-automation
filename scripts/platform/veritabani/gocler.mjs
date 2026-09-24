// PLATFORM VERİTABANI ŞEMASI + GÖÇ (migration) ÇALIŞTIRICISI.
//
// Kurallar:
// - Göçler yalnızca SONA eklenir; yayınlanmış bir göç ASLA değiştirilmez (yeni sürüm yazılır).
// - Uygulanan her göç "sema_surumu" tablosuna (surum, ad, uygulanma) yazılır; her göç kendi
//   transaction'ında çalışır — yarım kalan göç hiçbir iz bırakmaz.
// - Şema GENELDİR: hiçbir proje/ürün adı ya da projeye özgü iş kavramı şemaya ve motora GÖMÜLMEZ.
//   "Bağlam profili" (rol/şirket/şube...) ve "test verisi türü" projeye göre tanımlanır.
// - JSON sütunları TEXT'tir; geçerlilik uygulama katmanında (depo.mjs) denetlenir.
// - Kimlikler (id) kararlı UUID metinleridir: farklı makinelerden gelen yedekler kimlik
//   üzerinden birleştirilir. Zaman damgaları ISO-8601 (UTC) metindir.

/** @typedef {import('./baglanti.mjs').Veritabani} Veritabani */

/** @type {ReadonlyArray<{ surum: number; ad: string; sql: string }>} */
export const GOCLER = [
  {
    surum: 1,
    ad: 'temel_sema',
    sql: `
      CREATE TABLE meta (
        anahtar TEXT PRIMARY KEY,
        deger   TEXT NOT NULL
      );

      CREATE TABLE makineler (
        id           TEXT PRIMARY KEY,
        ad           TEXT NOT NULL,
        olusturulma  TEXT NOT NULL
      );

      CREATE TABLE ayarlar (
        anahtar      TEXT PRIMARY KEY,
        deger_json   TEXT NOT NULL,
        guncellenme  TEXT NOT NULL
      );

      CREATE TABLE projeler (
        id           TEXT PRIMARY KEY,
        ad           TEXT NOT NULL,
        aciklama     TEXT,
        ayarlar_json TEXT NOT NULL DEFAULT '{}',
        olusturulma  TEXT NOT NULL,
        guncellenme  TEXT NOT NULL
      );

      CREATE TABLE ortamlar (
        id           TEXT PRIMARY KEY,
        proje_id     TEXT NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
        ad           TEXT NOT NULL,
        taban_url    TEXT NOT NULL,
        varsayilan   INTEGER NOT NULL DEFAULT 0 CHECK (varsayilan IN (0, 1)),
        olusturulma  TEXT NOT NULL,
        guncellenme  TEXT NOT NULL
      );
      CREATE INDEX ix_ortamlar_proje ON ortamlar(proje_id);

      -- Giriş profili: kullanıcı adı + parola (+ isteğe bağlı 2FA). parola ve totp_gizli
      -- HASSAS alanlardır: yalnızca kasa zarfı ("kasa:v1:...") olarak saklanır.
      CREATE TABLE giris_profilleri (
        id              TEXT PRIMARY KEY,
        proje_id        TEXT NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
        ortam_id        TEXT REFERENCES ortamlar(id) ON DELETE SET NULL,
        ad              TEXT NOT NULL,
        kullanici_adi   TEXT NOT NULL,
        parola          TEXT,
        iki_asamali_tur TEXT NOT NULL DEFAULT 'yok' CHECK (iki_asamali_tur IN ('yok', 'totp', 'sms')),
        totp_gizli      TEXT,
        sms_ayari_json  TEXT NOT NULL DEFAULT '{}',
        olusturulma     TEXT NOT NULL,
        guncellenme     TEXT NOT NULL
      );
      CREATE INDEX ix_giris_profilleri_proje ON giris_profilleri(proje_id);

      -- Bağlam profili: rol/şirket/şube gibi projeye özgü bağlamlar (tür adını proje belirler).
      -- tur serbest metindir (proje tanımlar); alanlar_json proje tanımlı alanlar.
      CREATE TABLE baglam_profilleri (
        id           TEXT PRIMARY KEY,
        proje_id     TEXT NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
        tur          TEXT NOT NULL,
        ad           TEXT NOT NULL,
        alanlar_json TEXT NOT NULL DEFAULT '{}',
        olusturulma  TEXT NOT NULL,
        guncellenme  TEXT NOT NULL
      );
      CREATE INDEX ix_baglam_profilleri_proje ON baglam_profilleri(proje_id, tur);

      -- Test verisi türü: proje tanımlı alan listesi. alanlar_json =
      -- [{ "ad": "...", "etiket": "...", "tip": "metin|sayi|...", "hassas": true|false }]
      CREATE TABLE test_verisi_turleri (
        id           TEXT PRIMARY KEY,
        proje_id     TEXT NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
        ad           TEXT NOT NULL,
        alanlar_json TEXT NOT NULL DEFAULT '[]',
        olusturulma  TEXT NOT NULL,
        guncellenme  TEXT NOT NULL
      );
      CREATE INDEX ix_test_verisi_turleri_proje ON test_verisi_turleri(proje_id);

      -- Test verisi profili: degerler_json = { alanAdi: deger }; türde hassas işaretli
      -- alanların değerleri kasa zarfı olarak saklanır.
      CREATE TABLE test_verisi_profilleri (
        id            TEXT PRIMARY KEY,
        proje_id      TEXT NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
        tur_id        TEXT NOT NULL REFERENCES test_verisi_turleri(id) ON DELETE CASCADE,
        ad            TEXT NOT NULL,
        degerler_json TEXT NOT NULL DEFAULT '{}',
        olusturulma   TEXT NOT NULL,
        guncellenme   TEXT NOT NULL
      );
      CREATE INDEX ix_test_verisi_profilleri_tur ON test_verisi_profilleri(proje_id, tur_id);

      CREATE TABLE ekranlar (
        id           TEXT PRIMARY KEY,
        proje_id     TEXT NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
        anahtar      TEXT NOT NULL,
        ad           TEXT NOT NULL,
        aciklama     TEXT,
        olusturulma  TEXT NOT NULL,
        guncellenme  TEXT NOT NULL
      );
      CREATE INDEX ix_ekranlar_proje ON ekranlar(proje_id, anahtar);

      -- Ekran modeli sürümleri DEĞİŞMEZ kayıtlardır: her değişiklik yeni bir sürüm ekler.
      CREATE TABLE ekran_modelleri (
        id           TEXT PRIMARY KEY,
        ekran_id     TEXT NOT NULL REFERENCES ekranlar(id) ON DELETE CASCADE,
        surum        INTEGER NOT NULL CHECK (surum >= 1),
        model_json   TEXT NOT NULL,
        aciklama     TEXT,
        olusturulma  TEXT NOT NULL,
        UNIQUE (ekran_id, surum)
      );

      CREATE TABLE senaryolar (
        id            TEXT PRIMARY KEY,
        proje_id      TEXT NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
        ekran_id      TEXT REFERENCES ekranlar(id) ON DELETE SET NULL,
        baslik        TEXT NOT NULL,
        icerik_json   TEXT NOT NULL DEFAULT '{}',
        kosuya_dahil  INTEGER NOT NULL DEFAULT 1 CHECK (kosuya_dahil IN (0, 1)),
        olusturulma   TEXT NOT NULL,
        guncellenme   TEXT NOT NULL
      );
      CREATE INDEX ix_senaryolar_proje ON senaryolar(proje_id, ekran_id);
      CREATE INDEX ix_senaryolar_baslik ON senaryolar(proje_id, baslik);

      -- Denetim izi: senaryo ve profillerdeki her değişiklik (kim/ne zaman/ne/önce/sonra).
      -- Varlık silinse bile geçmiş kalsın diye varlik_id'de yabancı anahtar YOKTUR.
      -- onceki_json/sonraki_json satırın VERİTABANINDAKİ halidir (hassas alanlar şifreli).
      CREATE TABLE degisiklik_gecmisi (
        id            TEXT PRIMARY KEY,
        varlik_turu   TEXT NOT NULL,
        varlik_id     TEXT NOT NULL,
        islem         TEXT NOT NULL CHECK (islem IN ('olustur', 'guncelle', 'sil', 'birlestirme_cakismasi')),
        yapan         TEXT NOT NULL,
        makine_id     TEXT,
        zaman         TEXT NOT NULL,
        onceki_json   TEXT,
        sonraki_json  TEXT,
        aciklama      TEXT
      );
      CREATE INDEX ix_degisiklik_gecmisi_varlik ON degisiklik_gecmisi(varlik_turu, varlik_id, zaman);

      CREATE TABLE kosular (
        id          TEXT PRIMARY KEY,
        proje_id    TEXT REFERENCES projeler(id) ON DELETE SET NULL,
        ortam_id    TEXT REFERENCES ortamlar(id) ON DELETE SET NULL,
        makine_id   TEXT NOT NULL REFERENCES makineler(id),
        tur         TEXT NOT NULL DEFAULT 'tekil',
        durum       TEXT NOT NULL DEFAULT 'calisiyor',
        baslangic   TEXT NOT NULL,
        bitis       TEXT,
        ozet_json   TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX ix_kosular_proje ON kosular(proje_id, baslangic);
      CREATE INDEX ix_kosular_makine ON kosular(makine_id);

      CREATE TABLE kosu_sonuclari (
        id              TEXT PRIMARY KEY,
        kosu_id         TEXT NOT NULL REFERENCES kosular(id) ON DELETE CASCADE,
        senaryo_id      TEXT REFERENCES senaryolar(id) ON DELETE SET NULL,
        senaryo_baslik  TEXT NOT NULL,
        durum           TEXT NOT NULL,
        sure_ms         INTEGER,
        hata_mesaji     TEXT,
        ekler_json      TEXT NOT NULL DEFAULT '{}',
        baslangic       TEXT,
        bitis           TEXT
      );
      CREATE INDEX ix_kosu_sonuclari_kosu ON kosu_sonuclari(kosu_id);
      CREATE INDEX ix_kosu_sonuclari_senaryo ON kosu_sonuclari(senaryo_id);
    `
  },
  {
    // Sürüm 2 — genişletilmiş şifreleme + içe aktarma geçmişi:
    // - degisiklik_gecmisi.islem'e 'ice_aktarma_uzerine_yazildi' eklenir (SQLite CHECK kısıtı
    //   ALTER ile değişmediği için tablo yeniden kurulur; secure_delete eski sayfaları sıfırlar).
    // - SIFRELI_ALANLAR'daki sütunlarda v1'den kalan DÜZ METİN değerler, anahtar olmadan
    //   şifrelenemeyeceği için burada değil kasa İLK açıldığında şifrelenir
    //   (kasa.mjs > sifreliAlanlariTamamla); tamamlanınca meta.sifreli_alan_gocu = 'tamam'.
    surum: 2,
    ad: 'genisletilmis_sifreleme',
    sql: `
      CREATE TABLE degisiklik_gecmisi_yeni (
        id            TEXT PRIMARY KEY,
        varlik_turu   TEXT NOT NULL,
        varlik_id     TEXT NOT NULL,
        islem         TEXT NOT NULL CHECK (islem IN ('olustur', 'guncelle', 'sil', 'birlestirme_cakismasi', 'ice_aktarma_uzerine_yazildi')),
        yapan         TEXT NOT NULL,
        makine_id     TEXT,
        zaman         TEXT NOT NULL,
        onceki_json   TEXT,
        sonraki_json  TEXT,
        aciklama      TEXT
      );
      INSERT INTO degisiklik_gecmisi_yeni (id, varlik_turu, varlik_id, islem, yapan, makine_id, zaman, onceki_json, sonraki_json, aciklama)
        SELECT id, varlik_turu, varlik_id, islem, yapan, makine_id, zaman, onceki_json, sonraki_json, aciklama FROM degisiklik_gecmisi ORDER BY rowid;
      DROP TABLE degisiklik_gecmisi;
      ALTER TABLE degisiklik_gecmisi_yeni RENAME TO degisiklik_gecmisi;
      CREATE INDEX ix_degisiklik_gecmisi_varlik ON degisiklik_gecmisi(varlik_turu, varlik_id, zaman);
      INSERT INTO meta (anahtar, deger) VALUES ('sifreli_alan_gocu', 'bekliyor')
        ON CONFLICT(anahtar) DO UPDATE SET deger = 'bekliyor';
    `
  },
  {
    // Sürüm 3 — degisiklik_gecmisi.yapan artık DÜZ METİN makine adı içermez: "kullanici@<makineId>"
    // (makine adı makineler.ad'da şifreli durur; arayüz kasa açıkken kimliği ada çevirir).
    // Eski kayıtlar ("kullanici@makine-adi") aynı satırdaki makine_id ile yeniden yazılır;
    // makine_id yoksa "bilinmeyen-makine" kullanılır. "ice-aktarma:<makineId>" ve '@' içermeyen
    // (çağıranın verdiği) değerlere dokunulmaz. Aynı kural eski yedeklerden içe aktarılan
    // geçmiş kayıtlarına da uygulanır (depo.mjs > gecmisYapaniniNormallestir).
    surum: 3,
    ad: 'gecmis_yapan_makine_kimligi',
    sql: `
      UPDATE degisiklik_gecmisi
         SET yapan = substr(yapan, 1, instr(yapan, '@')) || COALESCE(makine_id, 'bilinmeyen-makine')
       WHERE instr(yapan, '@') > 0
         AND yapan NOT LIKE 'ice-aktarma:%'
         AND substr(yapan, instr(yapan, '@') + 1) <> COALESCE(makine_id, 'bilinmeyen-makine');
    `
  },
  {
    // Sürüm 4 — dış kaynaktan (mevcut proje dosyaları) aktarım + ortama göre veri:
    // - baglam_profilleri / test_verisi_profilleri.ortam_id: NULL = tüm ortamlar; dolu = yalnızca
    //   o ortam (aynı profil adı ortamlar arasında farklı değer taşıyabilir).
    // - ortamlar.ayarlar_json ve ekranlar.ayarlar_json: ortama/ekrana ait ayarlar (ŞİFRELİ, 'ozel').
    //   Ekran ayarlarında ortama göre değişen bölümler { "ortamlar": { "<ortamId>": {...} } } biçimindedir.
    // - kaynak_eslemeleri: aktarılan her kaydın kararlı kaynak anahtarı (ör. senaryo için
    //   "<dosya>::<başlık>") → varlık kimliği eşlemesi + kaynağın şifreli özeti (değişti mi?).
    //   Kimlikler kaynak anahtarından türetilir (kararlı UUID): iki makinede ayrı ayrı yapılan
    //   aktarımlar aynı kimlikleri üretir, yedek birleştirmede çift kayıt oluşmaz.
    // - Yeni şifreli sütunlarda '{}' varsayılanı düz metin kalmasın diye sifreli_alan_gocu
    //   'bekliyor'a çekilir (kasa ilk açıldığında şifrelenir).
    surum: 4,
    ad: 'kaynak_aktarimi_ve_ortam_kapsami',
    sql: `
      ALTER TABLE baglam_profilleri ADD COLUMN ortam_id TEXT REFERENCES ortamlar(id) ON DELETE CASCADE;
      ALTER TABLE test_verisi_profilleri ADD COLUMN ortam_id TEXT REFERENCES ortamlar(id) ON DELETE CASCADE;
      ALTER TABLE ortamlar ADD COLUMN ayarlar_json TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE ekranlar ADD COLUMN ayarlar_json TEXT NOT NULL DEFAULT '{}';

      CREATE TABLE kaynak_eslemeleri (
        id               TEXT PRIMARY KEY,
        proje_id         TEXT NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
        varlik_turu      TEXT NOT NULL,
        kaynak_anahtari  TEXT NOT NULL,
        varlik_id        TEXT NOT NULL,
        kaynak_ozeti     TEXT,
        olusturulma      TEXT NOT NULL,
        guncellenme      TEXT NOT NULL,
        UNIQUE (proje_id, varlik_turu, kaynak_anahtari)
      );
      CREATE INDEX ix_kaynak_eslemeleri_varlik ON kaynak_eslemeleri(varlik_turu, varlik_id);

      INSERT INTO meta (anahtar, deger) VALUES ('sifreli_alan_gocu', 'bekliyor')
        ON CONFLICT(anahtar) DO UPDATE SET deger = 'bekliyor';
    `
  }
];

/**
 * ŞİFRELİ SÜTUNLAR — tek bildirim noktası. depo (yazma/okuma), kasa (ilk açılışta düz metin
 * göçü, parola değişimi), içe aktarma (yeniden şifreleme, önizlemede maskeleme) ve testler
 * bu listeyi kullanır. Buradaki her sütun veritabanında YALNIZCA kasa zarfı ("kasa:v1:...")
 * olarak durur; yazmak ve okumak için kasa AÇIK olmalıdır.
 * - 'gizli': sır niteliğinde (parola, TOTP). Hiçbir yanıtta/önizlemede gösterilmez (maskelenir);
 *   yalnızca açıkça { coz: true } istenirse çözülür.
 * - 'ozel': gizli değil ama özel (ortam adı/adresi, kullanıcı adı, bağlam kodları, ayarlar).
 *   Diskte şifreli; kasa açıkken normal okumada ve içe aktarma önizlemesinde çözülür.
 * Test verisi profillerindeki alanlar sütun bazında değil, TÜRDEKİ "hassas" işaretine göre
 * değer bazında şifrelenir (degerler_json içinde zarf) ve önizlemede her zaman maskelenir.
 * Boş metin ('') şifrelenmez: makineler.ad, kasa yokken/kilitliyken yer tutucu olarak '' olabilir.
 * @type {Readonly<Record<string, Readonly<Record<string, 'gizli' | 'ozel'>>>>}
 */
export const SIFRELI_ALANLAR = Object.freeze({
  makineler: Object.freeze({ ad: 'ozel' }),
  ayarlar: Object.freeze({ deger_json: 'ozel' }),
  ortamlar: Object.freeze({ ad: 'ozel', taban_url: 'ozel', ayarlar_json: 'ozel' }),
  giris_profilleri: Object.freeze({ kullanici_adi: 'ozel', sms_ayari_json: 'ozel', parola: 'gizli', totp_gizli: 'gizli' }),
  baglam_profilleri: Object.freeze({ alanlar_json: 'ozel' }),
  ekranlar: Object.freeze({ ayarlar_json: 'ozel' }),
  kaynak_eslemeleri: Object.freeze({ kaynak_ozeti: 'ozel' })
});

/** @param {string} tablo @returns {string[]} */
export function sifreliSutunlar(tablo) {
  return Object.keys(SIFRELI_ALANLAR[tablo] ?? {});
}

/**
 * Tablo üst bilgileri — yedek/birleştirme ve parola değişimi bu listeyi kullanır.
 * Sıra = yabancı anahtar bağımlılık sırası (üstten alta ekleme, alttan üste silme).
 * - json: TEXT içinde JSON tutan sütunlar (uygulama katmanında doğrulanır).
 * - guncellenme: birleştirmede "yeni olan kazanır" kuralı uygulanabilir mi?
 * - gecmisTuru: değişiklikleri degisiklik_gecmisi'ne yazılan varlık türü.
 * - baslikAlani: çakışma raporunda gösterilecek insan-okur alan.
 * @type {ReadonlyArray<{ ad: string; birincilAnahtar: string; json: readonly string[]; guncellenme: boolean; gecmisTuru?: string; baslikAlani?: string }>}
 */
export const TABLOLAR = [
  { ad: 'makineler', birincilAnahtar: 'id', json: [], guncellenme: false, baslikAlani: 'ad' },
  { ad: 'ayarlar', birincilAnahtar: 'anahtar', json: ['deger_json'], guncellenme: true, baslikAlani: 'anahtar' },
  { ad: 'projeler', birincilAnahtar: 'id', json: ['ayarlar_json'], guncellenme: true, baslikAlani: 'ad' },
  { ad: 'ortamlar', birincilAnahtar: 'id', json: ['ayarlar_json'], guncellenme: true, baslikAlani: 'ad' },
  { ad: 'giris_profilleri', birincilAnahtar: 'id', json: ['sms_ayari_json'], guncellenme: true, gecmisTuru: 'giris_profili', baslikAlani: 'ad' },
  { ad: 'baglam_profilleri', birincilAnahtar: 'id', json: ['alanlar_json'], guncellenme: true, gecmisTuru: 'baglam_profili', baslikAlani: 'ad' },
  { ad: 'test_verisi_turleri', birincilAnahtar: 'id', json: ['alanlar_json'], guncellenme: true, baslikAlani: 'ad' },
  { ad: 'test_verisi_profilleri', birincilAnahtar: 'id', json: ['degerler_json'], guncellenme: true, gecmisTuru: 'test_verisi_profili', baslikAlani: 'ad' },
  { ad: 'ekranlar', birincilAnahtar: 'id', json: ['ayarlar_json'], guncellenme: true, baslikAlani: 'ad' },
  { ad: 'ekran_modelleri', birincilAnahtar: 'id', json: ['model_json'], guncellenme: false, baslikAlani: 'surum' },
  { ad: 'senaryolar', birincilAnahtar: 'id', json: ['icerik_json'], guncellenme: true, gecmisTuru: 'senaryo', baslikAlani: 'baslik' },
  { ad: 'kaynak_eslemeleri', birincilAnahtar: 'id', json: [], guncellenme: true, baslikAlani: 'kaynak_anahtari' },
  { ad: 'degisiklik_gecmisi', birincilAnahtar: 'id', json: ['onceki_json', 'sonraki_json'], guncellenme: false },
  { ad: 'kosular', birincilAnahtar: 'id', json: ['ozet_json'], guncellenme: false },
  { ad: 'kosu_sonuclari', birincilAnahtar: 'id', json: ['ekler_json'], guncellenme: false }
];

/** Veri içeren tabloların adları (meta ve sema_surumu HARİÇ). */
export const VERI_TABLOLARI = TABLOLAR.map((t) => t.ad);

/** @param {Veritabani} vt */
export function mevcutSemaSurumu(vt) {
  const tablo = vt.tek("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sema_surumu'");
  if (!tablo) return 0;
  const satir = vt.tek('SELECT MAX(surum) AS surum FROM sema_surumu');
  return Number(satir?.surum ?? 0);
}

export const GUNCEL_SEMA_SURUMU = GOCLER[GOCLER.length - 1].surum;

/**
 * Eksik göçleri sırayla uygular. Veritabanı uygulamanın bildiğinden YENİ bir şemadaysa
 * (başka makinede daha yeni sürümle oluşturulmuş) hata verir — eski kod yeni şemayı bozmasın.
 * @param {Veritabani} vt
 * @param {{ hedefSurum?: number }} [secenekler] hedefSurum: yalnızca bu sürüme kadar uygula (testlerde eski şemayı kurmak için)
 * @returns {{ onceki: number; simdiki: number; uygulananlar: number[] }}
 */
export function gocleriUygula(vt, secenekler = {}) {
  vt.islem(() => {
    vt.calistir(
      'CREATE TABLE IF NOT EXISTS sema_surumu (surum INTEGER PRIMARY KEY, ad TEXT NOT NULL, uygulanma TEXT NOT NULL)'
    );
  });
  const onceki = mevcutSemaSurumu(vt);
  if (onceki > GUNCEL_SEMA_SURUMU) {
    throw new Error(
      `Veritabanı şema sürümü (${onceki}) bu uygulamanın desteklediğinden (${GUNCEL_SEMA_SURUMU}) yeni. ` +
        'Uygulamayı güncelleyin (git pull + npm install).'
    );
  }
  const uygulananlar = [];
  for (const goc of GOCLER) {
    if (goc.surum <= onceki) continue;
    if (secenekler.hedefSurum !== undefined && goc.surum > secenekler.hedefSurum) break;
    vt.islem(() => {
      vt.db.run(goc.sql);
      vt.calistir('INSERT INTO sema_surumu (surum, ad, uygulanma) VALUES (?, ?, ?)', [
        goc.surum, goc.ad, new Date().toISOString()
      ]);
    });
    uygulananlar.push(goc.surum);
  }
  return { onceki, simdiki: mevcutSemaSurumu(vt), uygulananlar };
}
