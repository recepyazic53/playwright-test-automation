// TERİM DENETİMİ (terim-sozlugu.spec.ts): arayüz kaynaklarındaki dize değişmezlerini (tek / çift tırnak, şablon metni)
// satır numaralarıyla çıkaran küçük bir sözcük çözümleyici ve sözlüğe aykırı kullanımları bulan kurallar.
// Yorumlar denetlenmez (kullanıcıya görünmez); iç kimlikler (ör. 'kalan', '#/planli-kosular') Türkçe karakter taşımadığından
// kurallara takılmaz.

export type DizeDegismezi = { satir: number; metin: string };

const REGEX_ONCESI = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof', 'case', '=>']);
const KIMLIK_KARAKTERI = /[A-Za-z0-9_$À-ɏ]/;

/** Kaynaktaki dize değişmezleri (şablonlarda ${…} dışındaki metin parçaları ayrı ayrı). */
export function dizeDegismezleri(kaynak: string): DizeDegismezi[] {
  const sonuc: DizeDegismezi[] = [];
  const n = kaynak.length;
  let i = 0;
  let satir = 1;
  let onceki = '';
  let suslu = 0;
  const sablonYigini: number[] = [];

  const sablonOku = (): void => {
    const basla = satir;
    let metin = '';
    while (i < n) {
      const c = kaynak[i];
      if (c === '\\') { metin += kaynak.slice(i, i + 2); if (kaynak[i + 1] === '\n') satir++; i += 2; continue; }
      if (c === '`') { i++; sonuc.push({ satir: basla, metin }); return; }
      if (c === '$' && kaynak[i + 1] === '{') { sonuc.push({ satir: basla, metin }); i += 2; sablonYigini.push(suslu); suslu = 0; return; }
      if (c === '\n') satir++;
      metin += c;
      i++;
    }
  };

  while (i < n) {
    const c = kaynak[i];
    if (c === '\n') { satir++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && kaynak[i + 1] === '/') { while (i < n && kaynak[i] !== '\n') i++; continue; }
    if (c === '/' && kaynak[i + 1] === '*') {
      const son = kaynak.indexOf('*/', i + 2);
      const bitis = son < 0 ? n : son + 2;
      satir += (kaynak.slice(i, bitis).match(/\n/g) ?? []).length;
      i = bitis;
      continue;
    }
    if (c === '\'' || c === '"') {
      const basla = satir;
      let j = i + 1;
      let metin = '';
      while (j < n && kaynak[j] !== c && kaynak[j] !== '\n') {
        if (kaynak[j] === '\\') { metin += kaynak.slice(j, j + 2); j += 2; continue; }
        metin += kaynak[j];
        j++;
      }
      sonuc.push({ satir: basla, metin });
      i = j + 1;
      onceki = 'x';
      continue;
    }
    if (c === '`') { i++; sablonOku(); onceki = 'x'; continue; }
    if (c === '{') { suslu++; i++; onceki = '{'; continue; }
    if (c === '}') {
      if (sablonYigini.length && suslu === 0) { suslu = sablonYigini.pop() ?? 0; i++; sablonOku(); onceki = 'x'; continue; }
      suslu--;
      i++;
      onceki = '}';
      continue;
    }
    if (c === '/' && REGEX_ONCESI.has(onceki)) {
      let j = i + 1;
      let sinif = false;
      while (j < n) {
        const d = kaynak[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') sinif = true;
        else if (d === ']') sinif = false;
        else if ((d === '/' && !sinif) || d === '\n') break;
        j++;
      }
      i = j + 1;
      while (/[a-z]/.test(kaynak[i] ?? '')) i++;
      onceki = 'x';
      continue;
    }
    if (KIMLIK_KARAKTERI.test(c)) {
      let j = i;
      while (j < n && KIMLIK_KARAKTERI.test(kaynak[j])) j++;
      const sozcuk = kaynak.slice(i, j);
      onceki = REGEX_ONCESI.has(sozcuk) ? sozcuk : 'x';
      i = j;
      continue;
    }
    if (c === '=' && kaynak[i + 1] === '>') { onceki = '=>'; i += 2; continue; }
    onceki = c === ')' || c === ']' ? 'x' : c;
    i++;
  }
  return sonuc;
}

export type TerimKurali = { ad: string; bul: (metin: string, satir: string) => boolean };

/** Ortam anlamı taşıyan "CANLI" (ortam türü, CANLI onayı, TEST / CANLI kapsamı, "CANLI'da çağrılmasın"…). */
const ORTAM_BAGLAMI = /ortam|onay|TEST|çağrıl|izin|adres|kapsam|seçilemez|https?:/iu;

/**
 * "kalan test / adım / senaryo / kontrol / çalıştırma" sonuç anlamında mı? "Geriye kalan" anlamı (ör. "kalan senaryolar
 * koşmadı", "geçmişte kalan senaryolar") sonuç değildir ve kalabilir.
 */
function sonucAnlamindaKalan(m: string): boolean {
  for (const e of m.matchAll(/(^|[^\p{L}])([Kk]alan (?:test|adım|senaryo|kontrol|çalıştırma)\p{L}*)(\s+\p{L}+)?/gu)) {
    const once = m.slice(0, e.index + e[1].length);
    const sonraki = (e[3] ?? '').trim();
    if (/geçmişte\s*$/u.test(once) || /^(koşmadı|başlatılmadı|koşulmayacak|başlatılmaz)$/u.test(sonraki)) continue;
    return true;
  }
  return false;
}

/** Sözlüğe aykırı kullanımlar (yalnız kullanıcıya görünen metinde; dize değişmezine uygulanır). */
export const TERIM_KURALLARI: readonly TerimKurali[] = [
  { ad: '"Zamanlanmış koşu" yerine "Planlı koşu"', bul: (m) => /[Zz]amanlanmış (koşu|kural)/u.test(m) },
  { ad: 'tek başına "Veri" menü / başlık adı yerine "Test verisi"', bul: (m) => m.trim() === 'Veri' || /(^|[^\p{L}])Veri( >|'de|\\'de| sayfası)/u.test(m) },
  {
    ad: 'sonuç anlamında "Kaldı" / "kalan" yerine "Başarısız"',
    bul: (m) => /^\s*Kaldı\s*:?\s*$/u.test(m) || /(✗|Sözleşme:|Kontrol) [Kk]aldı/u.test(m) || /geçti\s*[/↔]\s*kaldı/u.test(m)
      || sonucAnlamindaKalan(m) ||/Yalnız kalan|yeni kalan|hep kalan|Kalan testlerin hataları/u.test(m)
  },
  {
    // Tek başına "CANLI" yalnız TEST / CANLI seçeneklerinin (kapsam) yanında; rozet, başlık ya da tema adı olamaz.
    ad: 'ortam dışı "CANLI" (canlı görüntü / tema)',
    bul: (m, satir) => /CANLI/u.test(m) && (m.trim() === 'CANLI' ? !/TEST/u.test(satir) : !ORTAM_BAGLAMI.test(m))
  },
  // Sol menü "Ekranlar ve akışlar" (ürün kavramı tanıtılmıyor): sayaç "N ekran", başlık "Ürünler" değil.
  { ad: '"ürün / ekran" / "Ürünler" yerine "ekran" / "Ekranlar ve akışlar"', bul: (m) => /ürün \/ ekran|^\s*(Ürünler|ÜRÜNLER)\s*$/u.test(m) },
  // Kod bilmeyen kullanıcıya "Playwright test adı" denmez; başlık raporlarda görünen test adıdır.
  { ad: '"Playwright test adı" yerine "raporlarda görünen test adı"', bul: (m) => /Playwright test adı/u.test(m) }
];

/** Tek bir dize değişmezini tüm kurallara karşı dener; takılan kuralların adları. */
export function terimIhlalleri(metin: string, satir = metin): string[] {
  return TERIM_KURALLARI.filter((k) => k.bul(metin, satir)).map((k) => k.ad);
}
