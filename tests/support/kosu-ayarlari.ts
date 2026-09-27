// Koşu ayarları (Ayarlar > Koşu; scripts/platform/ayarlar/kosu-ayarlari.mjs): Nöbetçi koşuyu başlatırken ayarları ortam
// değişkeni olarak verir. Değişken yoksa (terminalden / CI'dan koşu) önce kasadaki KAYITLI ayar (veri okuyucu kasayı açabildiyse;
// genel-veri.ts > kasaKosuAyarlariniYukle), o da yoksa önceki varsayılanlar kullanılır. Değerler ÇAĞRI anında okunur (kasadaki
// ayarlar modüller yüklendikten sonra gelir).

type Kayit = 'her' | 'yalnizHata' | 'kapali';

/** Kasadaki kayıtlı ayarlar (ortam değişkeni adı → değer); yalnız kullanıcının kaydettikleri. */
let kasaAyarlari: Record<string, string> = {};

/** Veri okuyucunun (veri-oku.mjs) kasadan okuduğu kayıtlı koşu ayarlarını yükler (ortam değişkeni verilmemişse bunlar kullanılır). */
export function kasaKosuAyarlariniYukle(ayarlar: Record<string, string> | null | undefined): void {
  kasaAyarlari = ayarlar && typeof ayarlar === 'object' ? { ...ayarlar } : {};
}

/** Ayarın ham değeri: ortam değişkeni (Nöbetçi koşusu) > kasadaki kayıtlı ayar > undefined. */
export function ayarDegeri(ad: string): string | undefined {
  const v = process.env[ad];
  if (v !== undefined && v !== '') return v;
  const k = kasaAyarlari[ad];
  return k !== undefined && k !== '' ? k : undefined;
}

const kayit = (ad: string): Kayit | undefined => {
  const v = ayarDegeri(ad);
  return v === 'her' || v === 'yalnizHata' || v === 'kapali' ? v : undefined;
};

/** Video: Nöbetçi koşusunda varsayılan her koşuda (panelde izlenir), diğerlerinde yalnız kalan testlerde. Kasadaki ayar okunmaz (ayar Nöbetçi koşuları içindir). */
export function videoAyari(): 'on' | 'retain-on-failure' | 'off' {
  const e = process.env.NOBETCI_VIDEO;
  const v = e === 'her' || e === 'yalnizHata' || e === 'kapali' ? e : process.env.TEST_SUNUCU_GORUNUR ? 'her' : 'yalnizHata';
  return v === 'her' ? 'on' : v === 'yalnizHata' ? 'retain-on-failure' : 'off';
}

/** Test sonu ekran görüntüsü (varsayılan yalnız kalan testlerde). fixtures.ts > hataYakalayici de buna uyar. */
export function ekranGoruntusuAyari(): 'on' | 'only-on-failure' | 'off' {
  const v = kayit('NOBETCI_EKRAN_GORUNTUSU') ?? 'yalnizHata';
  return v === 'her' ? 'on' : v === 'yalnizHata' ? 'only-on-failure' : 'off';
}

/** İz / trace (varsayılan yalnız kalan testlerde). */
export function izAyari(): 'on' | 'retain-on-failure' | 'off' {
  const v = kayit('NOBETCI_IZ') ?? 'yalnizHata';
  return v === 'her' ? 'on' : v === 'yalnizHata' ? 'retain-on-failure' : 'off';
}

/**
 * Doğrulanan (indirilen) dosya rapora ek olarak saklansın mı (Ayarlar > Koşu > Kayıt > Doğrulanan dosya): varsayılan saklanmaz
 * (yalnız özet); 'yalnizHata' yalnız beklentisi kalan dosya; 'her' her zaman.
 */
export function indirilenDosyaAyari(): Kayit {
  return kayit('NOBETCI_INDIRILEN_DOSYA') ?? 'kapali';
}

/** Yeniden deneme sayısı (0–3): ortam değişkeni > kasadaki kayıtlı ayar > CI'da 2, diğerlerinde 0. */
export function yenidenDenemeAyari(): number {
  const ham = ayarDegeri('NOBETCI_YENIDEN_DENEME');
  const n = Number(ham);
  return ham !== undefined && Number.isInteger(n) && n >= 0 && n <= 3 ? n : process.env.CI ? 2 : 0;
}

/** Milisaniye ayarı (ör. NOBETCI_ALAN_BEKLEME_MS); geçersiz / yoksa varsayılan. */
export function sureAyari(ad: string, varsayilanMs: number, enAzMs = 1_000, enCokMs = 600_000): number {
  const ham = ayarDegeri(ad);
  const n = Number(ham);
  return ham !== undefined && Number.isFinite(n) && n >= enAzMs && n <= enCokMs ? n : varsayilanMs;
}

/** Tam sayı ayarı; geçersiz / yoksa varsayılan. */
export function sayiAyari(ad: string, varsayilan: number, enAz: number, enCok: number): number {
  const ham = ayarDegeri(ad);
  const n = Number(ham);
  return ham !== undefined && Number.isInteger(n) && n >= enAz && n <= enCok ? n : varsayilan;
}

/** Seçim ayarı; listede yoksa varsayılan. */
export function secimAyari<T extends string>(ad: string, secenekler: readonly T[], varsayilan: T): T {
  const v = ayarDegeri(ad);
  return v !== undefined && (secenekler as readonly string[]).includes(v) ? (v as T) : varsayilan;
}

/** Koşu süre limiti (ms; Ayarlar > Koşu > Koşu süre limiti); bilinmiyorsa null. */
export function kosuSureLimitiMs(): number | null {
  const n = sureAyari('NOBETCI_KOSU_SURE_LIMITI_MS', -1, 60_000, 120 * 60_000);
  return n > 0 ? n : null;
}

/** Nöbetçi'nin süre limitinde süreci durdurmasından önce testin kendi zaman aşımına düşmesi için bırakılan pay. */
export const KOSU_SURE_PAYI_MS = 30_000;

/**
 * Model senaryosunun test süresi: koşu süre limiti biliniyorsa limitten KOSU_SURE_PAYI_MS önce (en az 30 sn) — test süresi limiti
 * aşmaz, limit büyükse test onu kullanabilir; limit bilinmiyorsa (terminal, kasa yok) önceki formül: giriş + bağlam + adım başına 30 sn.
 */
export function modelTestSuresiMs(adimSayisi: number, limitMs: number | null = kosuSureLimitiMs()): number {
  if (limitMs === null) return 120_000 + adimSayisi * 30_000;
  return Math.max(30_000, limitMs - KOSU_SURE_PAYI_MS);
}

/** Koşu tarayıcısının boyutu / dili / saat dilimi (Ayarlar > Koşu > Gelişmiş; varsayılanlar Playwright "Desktop Chrome" ve bilgisayarınki). */
export function kosuTarayiciAyarlari(): { viewport: { width: number; height: number }; locale?: string; timezoneId?: string } {
  const dil = ayarDegeri('NOBETCI_TARAYICI_DILI');
  const saat = ayarDegeri('NOBETCI_SAAT_DILIMI');
  return {
    viewport: { width: sayiAyari('NOBETCI_EKRAN_GENISLIGI', 1280, 320, 3840), height: sayiAyari('NOBETCI_EKRAN_YUKSEKLIGI', 720, 240, 2160) },
    ...(dil && dil !== 'varsayilan' && /^[a-z]{2,3}-[A-Z]{2}$/.test(dil) ? { locale: dil } : {}),
    ...(saat && saat !== 'bilgisayar' && /^[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(saat) ? { timezoneId: saat } : {})
  };
}
