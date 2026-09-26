// Koşu ayarları (Ayarlar > Koşu; scripts/platform/ayarlar/kosu-ayarlari.mjs): Nöbetçi koşuyu başlatırken ayarları ortam
// değişkeni olarak verir. Değişken yoksa (terminalden / CI'dan koşu) önceki varsayılanlar kullanılır.

type Kayit = 'her' | 'yalnizHata' | 'kapali';
const kayit = (ad: string): Kayit | undefined => {
  const v = process.env[ad];
  return v === 'her' || v === 'yalnizHata' || v === 'kapali' ? v : undefined;
};

/** Video: Nöbetçi koşusunda varsayılan her koşuda (panelde izlenir), diğerlerinde yalnız kalan testlerde. */
export function videoAyari(): 'on' | 'retain-on-failure' | 'off' {
  const v = kayit('NOBETCI_VIDEO') ?? (process.env.TEST_SUNUCU_GORUNUR ? 'her' : 'yalnizHata');
  return v === 'her' ? 'on' : v === 'yalnizHata' ? 'retain-on-failure' : 'off';
}

/** Test sonu ekran görüntüsü (varsayılan yalnız kalan testlerde). */
export function ekranGoruntusuAyari(): 'on' | 'only-on-failure' | 'off' {
  const v = kayit('NOBETCI_EKRAN_GORUNTUSU') ?? 'yalnizHata';
  return v === 'her' ? 'on' : v === 'yalnizHata' ? 'only-on-failure' : 'off';
}

/** İz / trace (varsayılan yalnız kalan testlerde). */
export function izAyari(): 'on' | 'retain-on-failure' | 'off' {
  const v = kayit('NOBETCI_IZ') ?? 'yalnizHata';
  return v === 'her' ? 'on' : v === 'yalnizHata' ? 'retain-on-failure' : 'off';
}

/** Yeniden deneme sayısı (0–3); verilmezse CI'da 2, diğerlerinde 0. */
export function yenidenDenemeAyari(): number {
  const n = Number(process.env.NOBETCI_YENIDEN_DENEME);
  return Number.isInteger(n) && n >= 0 && n <= 3 && process.env.NOBETCI_YENIDEN_DENEME !== '' && process.env.NOBETCI_YENIDEN_DENEME !== undefined
    ? n : process.env.CI ? 2 : 0;
}

/** Milisaniye ayarı (ör. NOBETCI_ALAN_BEKLEME_MS); geçersiz / yoksa varsayılan. */
export function sureAyari(ad: string, varsayilanMs: number): number {
  const n = Number(process.env[ad]);
  return Number.isFinite(n) && n >= 1_000 && n <= 600_000 ? n : varsayilanMs;
}
