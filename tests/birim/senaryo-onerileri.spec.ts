// KORUMA TESTLERİ — senaryo tasarım yardımcısının SAF öneri fonksiyonu (senaryo-onerileri.mjs; tarayıcı yok, saat ve veri enjekte):
// gerekçe / neden / puan; yeni bir şey kapsamayan önerinin elenmesi ve denklik tekilleştirmesi; zorunlu alan (beklenen sonuç yalnız
// modelde gösterge / kural varsa), sınır değerleri (yalnız modeldeki kurallardan), koşullu dallar, PAIRWISE (bilinen örnekler, mevcut
// ikililer, görünürlük, bağımlı liste, deterministik), risk (hata geçmişi, test edilmemiş uyarı), öğrenme (kabul / red), kapsam
// ölçüleri, sıralama, üst sınır, kişisel / gizli alanda değer üretmeme; doğrulayıcının "bilerek boş" uyarısı ve koşucu.
import { expect, test } from '@playwright/test';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { MESAJLAR, gorunurlukleriHesapla, senaryoyuDogrula, type DogrulamaModeli } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import {
  MASKE, NEDEN_PUANLARI, ONERI_UST_SINIRI, ikiliAnahtari, ikiliCoz, pairwiseUret, senaryoOnerileri,
  type Oneri, type OneriGirdisi, type OneriKarari, type OneriSenaryosu
} from '../../scripts/platform/senaryolar/senaryo-onerileri.mjs';
import { TELEFON, siparisModeli, tabanVerisi } from './senaryo-onerileri-fikstur';

type Nesne = Record<string, any>;
const SIMDI = new Date(2026, 8, 28, 10, 0, 0);

/** Tüm önerileri görmek için üst sınır yüksek; pairwise kapalı (ayrı testlerde açılır). */
function girdi(model: Nesne, senaryolar: OneriSenaryosu[], ek: Partial<OneriGirdisi> = {}): OneriGirdisi {
  const baglam = { model: model as DogrulamaModeli, altModeller: {}, kaynak: 'kayit' as const, simdi: SIMDI };
  return {
    model, sema: formSemasiOlustur(model, {}), senaryolar, simdi: SIMDI, ustSinir: 1000, kombinasyonAlanlari: [],
    gorunurlukHesapla: (veri) => gorunurlukleriHesapla(veri, baglam),
    dogrula: (veri) => senaryoyuDogrula(veri, baglam),
    ...ek
  };
}
const dogrula = (model: Nesne, veri: Nesne) => senaryoyuDogrula(veri, { model: model as DogrulamaModeli, altModeller: {}, kaynak: 'kayit', simdi: SIMDI });
const bul = (liste: Oneri[], kimlik: string): Oneri => {
  const o = liste.find((x) => x.kimlik === kimlik);
  expect(o, `öneri yok: ${kimlik}\nvar olanlar: ${liste.map((x) => x.kimlik).join(', ')}`).toBeTruthy();
  return o as Oneri;
};
const kimlikler = (liste: Oneri[], tur?: string) => liste.filter((o) => !tur || o.tur === tur).map((o) => o.kimlik);
const TABAN: OneriSenaryosu = { id: 's1', baslik: 'Kitap siparişi', veri: tabanVerisi('03.10.2026'), sonDurum: 'basarili' };
const TUM_SECIM = ['kategori', 'beden', 'renk', 'hediyePaketi'];

// ---- Pairwise motoru ----------------------------------------------------------------------------------

const alanlar = (n: number, k: number) => Array.from({ length: n }, (_, i) => ({ anahtar: `a${i}`, degerler: Array.from({ length: k }, (_, j) => String(j)) }));
/** Satırların kapsadığı ikililer (görünürlük verilirse gizli alanlar sayılmaz). */
function kapsananlar(satirlar: Array<Record<string, string>>, n: number, gorunur = (_s: Record<string, string>, _a: string) => true): Set<string> {
  const k = new Set<string>();
  for (const s of satirlar) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (gorunur(s, `a${i}`) && gorunur(s, `a${j}`) && s[`a${i}`] && s[`a${j}`]) k.add(ikiliAnahtari(`a${i}`, s[`a${i}`], `a${j}`, s[`a${j}`]));
  }
  return k;
}

test('pairwise: 3 alan × 2 değer → 4 satırla tüm ikililer; 5 × 3 → en çok 15 satır ve tüm ikililer; aynı girdide aynı çıktı', () => {
  const r = pairwiseUret({ alanlar: alanlar(3, 2) });
  expect(r.evren).toHaveLength(12);
  expect(r.satirlar).toHaveLength(4);
  expect(kapsananlar(r.satirlar.map((x) => x.satir), 3)).toEqual(new Set(r.evren));
  expect(r.kalan).toEqual([]);

  const b = pairwiseUret({ alanlar: alanlar(5, 3) });
  expect(b.evren).toHaveLength(90);
  expect(b.satirlar.length).toBeLessThanOrEqual(15);
  expect(kapsananlar(b.satirlar.map((x) => x.satir), 5)).toEqual(new Set(b.evren));
  // Tam çarpım 243 satır olurdu.
  expect(b.satirlar.length).toBeLessThan(243 / 10);
  // Deterministik.
  expect(pairwiseUret({ alanlar: alanlar(5, 3) })).toEqual(b);
});

test('pairwise: mevcut ikililer çıkarılınca yalnız eksikler; gizlenen alanın ikilileri istenmez; bağımlı listede yalnız geçerli değerler', () => {
  // 3 × 2: mevcut 2 satır (000, 111) 6 ikiliyi kapsar; yalnız kalan 6 ikili için satır üretilir.
  const mevcut = [{ a0: '0', a1: '0', a2: '0' }, { a0: '1', a1: '1', a2: '1' }];
  const kapsanan = [...kapsananlar(mevcut, 3)];
  const r = pairwiseUret({ alanlar: alanlar(3, 2), kapsanan });
  expect(r.kapsanan).toHaveLength(6);
  const yeni = r.satirlar.flatMap((x) => x.yeniIkililer);
  expect(new Set(yeni).size).toBe(6);
  for (const k of yeni) expect(kapsanan).not.toContain(k);
  expect(new Set([...kapsanan, ...yeni])).toEqual(new Set(r.evren));

  // a2 yalnız a0 = "1" iken görünür: (a0=0, a2=*) ikilileri kurulamaz (evrende yok), satırlarda gizli a2 sayılmaz.
  const gorunur = (s: Record<string, string>, a: string) => a !== 'a2' || s.a0 === '1';
  const g = pairwiseUret({
    alanlar: alanlar(3, 2), taban: { a0: '0', a1: '0', a2: '0' },
    gorunurler: (s) => new Set(['a0', 'a1', 'a2'].filter((a) => gorunur(s, a))),
    kontrolculer: (a) => (a === 'a2' ? ['a0'] : [])
  });
  expect(g.gecersiz.sort()).toEqual([ikiliAnahtari('a0', '0', 'a2', '0'), ikiliAnahtari('a0', '0', 'a2', '1')].sort());
  expect(g.evren).toHaveLength(10);
  // a1–a2 ikilileri a0 = 1 tamamlamasıyla kurulur.
  expect(g.evren).toContain(ikiliAnahtari('a1', '0', 'a2', '1'));
  expect(kapsananlar(g.satirlar.map((x) => x.satir), 3, gorunur)).toEqual(new Set(g.evren));

  // Bağımlı liste: a1'in değerleri a0'a bağlı (0 → x, y; 1 → z). Geçersiz ikili (a0=0, a1=z) evrende yok; satırlar hep geçerli.
  const harita: Record<string, string[]> = { 0: ['x', 'y'], 1: ['z'] };
  const secenekler = (s: Record<string, string>, a: string) => (a === 'a1' ? harita[s.a0] ?? [] : a === 'a0' ? ['0', '1'] : ['p', 'q']);
  const d = pairwiseUret({
    alanlar: [{ anahtar: 'a0', degerler: ['0', '1'] }, { anahtar: 'a1', degerler: ['x', 'y', 'z'] }, { anahtar: 'a2', degerler: ['p', 'q'] }],
    taban: { a0: '0', a1: 'x', a2: 'p' }, secenekler,
    ata: (s, a, v, sabit) => {
      if (!secenekler(s, a).includes(v)) return null;
      const r2 = { ...s, [a]: v };
      if (a === 'a0' && !harita[v].includes(r2.a1)) { if (sabit.has('a1')) return null; r2.a1 = harita[v][0]; }
      return r2;
    },
    kontrolculer: (a) => (a === 'a1' ? ['a0'] : [])
  });
  expect(d.gecersiz).toContain(ikiliAnahtari('a0', '0', 'a1', 'z'));
  expect(d.gecersiz).toContain(ikiliAnahtari('a0', '1', 'a1', 'x'));
  for (const { satir } of d.satirlar) expect(harita[satir.a0]).toContain(satir.a1);
  expect(d.kalan).toEqual([]);
  expect(ikiliCoz(ikiliAnahtari('a', '1', 'b', 'x=y'))).toEqual([['a', '1'], ['b', 'x=y']]);
});

test('pairwise ekranda: bağımlı liste, görünürlük koşulu, mevcut / diğer akış / veri güdümlü satır ikilileri kapsanmış sayılır', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN], { kombinasyonAlanlari: ['kategori', 'beden', 'renk'] }));
  const k = s.kombinasyon;
  expect(k.secili).toEqual(['kategori', 'beden', 'renk']);
  // Evren: kategori × renk geçerli 5 + kategori(giyim) × beden 3 + beden × renk(kırmızı, mavi) 6 = 14; tabanın (kitap, standart) ikilisi kapsanmış.
  expect(k).toMatchObject({ evren: 14, kapsanan: 1, eksik: 13, kalan: 0 });
  expect(s.kapsam.ikililer).toMatchObject({ kapsanan: 1, toplam: 14 });
  const satirlar = s.oneriler.filter((o) => o.tur === 'kombinasyon');
  expect(satirlar.length).toBe(k.satir);
  expect(satirlar.length).toBeLessThanOrEqual(8);
  const harita = model.adimlar[0].bolumler[0].alanlar[4].bagimlilik.secenekHaritasi as Record<string, Nesne[]>;
  for (const o of satirlar) {
    expect(harita[String(o.veri.kategori)].map((x: Nesne) => x.deger), o.kimlik).toContain(o.veri.renk);
    // Beden yalnız giyimde (görünmeyen alanın değeri yazılmaz).
    if (o.veri.kategori !== 'giyim') expect(o.veri, o.kimlik).not.toHaveProperty('beden');
    expect(o.gerekce, o.kimlik).toMatch(/hiç birlikte denenmedi/);
    expect(o.ikililer?.length, o.kimlik).toBeGreaterThan(0);
    // Telefon (gizli) tabandan aynen; değer üretilmez.
    expect(o.veri.telefon).toBe(TELEFON);
  }
  // Tüm eksik ikililer satırlarla kapanır.
  expect(new Set(satirlar.flatMap((o) => o.ikililer ?? [])).size).toBe(13);

  // Mevcut senaryo + diğer akıştaki senaryo + veri güdümlü satırlar: onların ikilileri eksik sayılmaz.
  const giyim: OneriSenaryosu = { id: 's2', baslik: 'Giyim', veri: { ...tabanVerisi('03.10.2026'), kategori: 'giyim', renk: 'mavi', beden: 'S' } };
  const digerAkis: OneriSenaryosu = { id: 'd1', baslik: 'Diğer akış', veri: { ...tabanVerisi('03.10.2026'), kategori: 'elektronik', renk: 'siyah' } };
  const veriGudumlu: OneriSenaryosu = {
    id: 's3', baslik: 'Tablodan', veri: { ...tabanVerisi('03.10.2026'), kategori: 'giyim', renk: '${Renkler.Renk}', beden: '${Renkler.Beden}' },
    degerSatirlari: [{ renk: 'kirmizi', beden: 'M' }, { renk: 'kirmizi', beden: 'L' }]
  };
  const t = senaryoOnerileri(girdi(model, [TABAN, giyim, veriGudumlu], { kombinasyonAlanlari: ['kategori', 'beden', 'renk'], kapsamSenaryolari: [digerAkis] }));
  // Kapsanan: kitap+standart (1), giyim+mavi, giyim+S, S+mavi (3), elektronik+siyah (1), giyim+kırmızı, giyim+M, giyim+L, M+kırmızı, L+kırmızı (5).
  expect(t.kombinasyon).toMatchObject({ evren: 14, kapsanan: 10, eksik: 4 });
  const yeni = new Set(t.oneriler.filter((o) => o.tur === 'kombinasyon').flatMap((o) => o.ikililer ?? []));
  expect([...yeni].sort()).toEqual(['Beden: L + Renk: Mavi', 'Beden: M + Renk: Mavi', 'Beden: S + Renk: Kırmızı', 'Kategori: Elektronik + Renk: Beyaz'].sort());
  // Deterministik.
  expect(senaryoOnerileri(girdi(model, [TABAN], { kombinasyonAlanlari: ['kategori', 'beden', 'renk'] })).oneriler).toEqual(s.oneriler);
});

// ---- Zorunlu / sınır / koşullu ----------------------------------------------------------------------

test('fikstür modeli ekran modeli doğrulayıcısından geçer; hatalı "sinirlar" reddedilir', () => {
  expect(() => ekranModeliniDogrula('siparis.model.json', siparisModeli(), () => undefined)).not.toThrow();
  const bozuk = siparisModeli();
  bozuk.adimlar[0].bolumler[0].alanlar[1].sinirlar = { enAz: 'bir', enCok: 0, fazla: 1 };
  bozuk.adimlar[1].bolumler[0].alanlar[0].sinirlar = { enAz: 'yarın' };
  bozuk.adimlar[0].bolumler[0].alanlar[0].sinirlar = { enAzUzunluk: 5, enCokUzunluk: 2, desen: '(' };
  let mesaj = '';
  try { ekranModeliniDogrula('siparis.model.json', bozuk, () => undefined); } catch (e) { mesaj = String(e); }
  for (const parca of ['"enAz" sayı olmalı', 'bilinmeyen anahtar "fazla"', '"enAz" tarihte', '"enAzUzunluk" "enCokUzunluk"tan büyük olamaz', '"desen" geçerli bir düzenli ifade değil']) {
    expect(mesaj).toContain(parca);
  }
});

test('zorunlu alanlar: alan başına gerekçeli öneri, alan bilerek boş; beklenen sonuç yalnız modelden; zaten denenmişse elenir', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN]));
  expect(s.taban).toMatchObject({ kaynak: 'senaryo', senaryoId: 's1', eksikler: [] });
  expect(kimlikler(s.oneriler, 'zorunlu').sort()).toEqual(['zorunlu:adet', 'zorunlu:kategori', 'zorunlu:telefon', 'zorunlu:teslimatTarihi', 'zorunlu:urunAdi']);
  for (const o of s.oneriler) {
    expect(o.gerekce, o.kimlik).toBeTruthy();
    expect(Object.keys(NEDEN_PUANLARI), o.kimlik).toContain(o.neden);
  }

  const adet = bul(s.oneriler, 'zorunlu:adet');
  expect(adet).toMatchObject({ neden: 'zorunlu', baslik: 'Zorunlu alan boş: Adet', eklenebilir: true, engel: null });
  expect(adet.gerekce).toBe('“Adet” boş bırakıldığında ne olduğu hiç denenmedi (modeldeki kural: “Lütfen adet giriniz.”)');
  expect(adet.veri).not.toHaveProperty('adet');
  expect(adet.veri.bilerekBos).toEqual(['adet']);
  expect(adet.veri).toMatchObject({ urunAdi: 'Roman', kategori: 'kitap', beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'urun', mesaj: 'Lütfen adet giriniz.' } });
  const d = dogrula(model, adet.veri);
  expect(d.hatalar).toEqual([]);
  expect(d.uyarilar).toContainEqual({ alan: 'adet', mesaj: MESAJLAR.bilerekBos('Adet') });

  expect(bul(s.oneriler, 'zorunlu:urunAdi').beklenen).toMatchObject({ tur: 'hata', adim: 'urun', mesaj: '', mesajEksik: true });
  const tarih = bul(s.oneriler, 'zorunlu:teslimatTarihi');
  expect(tarih).toMatchObject({ beklenenMetni: 'Beklenen sonucu siz seçin', eklenebilir: false });
  expect(tarih.veri).not.toHaveProperty('beklenenSonuc');

  // Bilerek boş olmayan zorunlu boşluk hâlâ hatadır.
  const { bilerekBos: _yok, ...bosVeri } = adet.veri;
  expect(dogrula(model, bosVeri).hatalar).toContainEqual({ alan: 'adet', mesaj: MESAJLAR.zorunlu('Adet') });

  // Adet boş senaryosu (başka akışta bile) varsa öneri elenir.
  const t = senaryoOnerileri(girdi(model, [TABAN], { kapsamSenaryolari: [{ id: 'x', baslik: 'Adetsiz', veri: adet.veri }] }));
  expect(kimlikler(t.oneriler)).not.toContain('zorunlu:adet');
  expect(t.elenen.kapsanan).toBeGreaterThan(s.elenen.kapsanan);
});

test('koşucu: bilerek boş alana modelin varsayılanını yazmaz (varsayılan yalnız gerçekten boş bırakılan alana)', () => {
  const model = siparisModeli();
  const veri = { ...tabanVerisi('03.10.2026'), adet: undefined };
  const alanlarListesi = (v: Nesne) => modelKosuPlani(model, v).adimlar.flatMap((a: Nesne) => a.alanlar).map((x: Nesne) => [x.id, x.deger]);
  expect(alanlarListesi(veri)).toContainEqual(['adet', 1]);
  expect(alanlarListesi({ ...veri, bilerekBos: ['adet'] }).map(([id]: unknown[]) => id)).not.toContain('adet');
});

test('sınır değerleri yalnız modeldeki kurallardan; denklik: sınırın hemen içi elenir; denenmiş değer elenir; kural yoksa not', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN]));
  const sinir = s.oneriler.filter((o) => o.tur === 'sinir').sort((a, b) => a.kimlik.localeCompare(b.kimlik));
  const adet = sinir.filter((o) => o.kimlik.startsWith('sinir:adet:'));
  expect(adet.map((o) => Number(o.veri.adet)).sort((a, b) => a - b)).toEqual([0, 1, 10, 11]);
  const adet0 = bul(sinir, 'sinir:adet:0');
  expect(adet0).toMatchObject({ baslik: 'Sınır: Adet = 0 (alt sınır − 1)', neden: 'sinir', beklenen: { tur: 'hata', adim: 'urun', mesajEksik: true } });
  expect(adet0.gerekce).toBe('“Adet” için modelde kural var (en az 1, en çok 10); alt sınır − 1 (geçersiz) hiç denenmedi');
  expect(bul(sinir, 'sinir:adet:1').beklenen.tur).toBe('basari');
  // Geçersiz sınır geçerliden önce (önem).
  expect(adet0.puan).toBeGreaterThan(bul(sinir, 'sinir:adet:1').puan);

  expect(sinir.filter((o) => o.kimlik.startsWith('sinir:urunAdi:')).map((o) => String(o.veri.urunAdi).length).sort((a, b) => a - b)).toEqual([2, 3, 10, 11]);
  expect(bul(sinir, 'sinir:urunAdi:Rom').veri.urunAdi).toBe('Rom'); // tabandaki değerden türetilir
  const tarih = sinir.filter((o) => o.kimlik.startsWith('sinir:teslimatTarihi:')).map((o) => o.veri.teslimatTarihi);
  expect(tarih.sort()).toEqual(['bugün', 'bugün+1', 'bugün+30', 'bugün+31'].sort());
  expect(bul(sinir, 'sinir:teslimatTarihi:bugün+1').ozet).toContain('= bugün+1 → 29.09.2026');
  expect(s.elenen.denklik).toBeGreaterThanOrEqual(6); // alt+1 / üst−1 (3 alan × 2)

  // Denenmiş sınır değeri elenir.
  const t = senaryoOnerileri(girdi(model, [TABAN, { id: 's9', baslik: 'On adet', veri: { ...tabanVerisi('03.10.2026'), adet: 10 } }]));
  expect(kimlikler(t.oneriler)).not.toContain('sinir:adet:10');

  const notlar = s.notlar.filter((n) => n.tur === 'sinir').map((n) => n.mesaj).join('\n');
  expect(notlar).toMatch(/Sınır kuralı tanımlı olmayan alanlar: Sipariş notu, Hediye notu\./);
  expect(notlar).toContain('"Kupon kodu" için yalnız desen kuralı var');
});

test('koşullu dallar: denenmemiş dal gerekçeli öneri; denenmiş dal elenir; aynı etkili dallardan biri kalır', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN]));
  // Taban kitap + hediye paketi işaretsiz: bu iki dal denenmiş, önerilmez.
  expect(kimlikler(s.oneriler, 'kosullu').sort()).toEqual(['kosullu:hediyePaketi=true', 'kosullu:kategori=elektronik', 'kosullu:kategori=giyim']);
  const giyim = bul(s.oneriler, 'kosullu:kategori=giyim');
  expect(giyim).toMatchObject({ neden: 'kapsam', baslik: 'Koşul: Kategori = Giyim', eklenebilir: false, eksikler: ['Beden'] });
  expect(giyim.gerekce).toBe('“Kategori = Giyim” dalı hiç denenmedi (Beden görünür)');
  expect(giyim.ozet).toContain('Renk seçenekleri: Kırmızı, Mavi');
  expect(giyim.veri).toMatchObject({ kategori: 'giyim', renk: 'kirmizi' });
  expect(bul(s.oneriler, 'kosullu:kategori=elektronik')).toMatchObject({ eklenebilir: true, beklenen: { tur: 'basari' } });
  expect(s.kapsam.dallar).toEqual({ kapsanan: 2, toplam: 5, eksikler: ['Kategori = Giyim', 'Kategori = Elektronik', 'Hediye paketi = işaretli'] });

  // Denklik: teslimat türü "standart" ve "hızlı" aynı etkili (ek alan görünmez), "randevulu" farklı → 2 sınıf, en çok 2 öneri.
  const m = siparisModeli();
  m.kosullar.randevulu = { ifade: { alan: 'teslimatTuru', esit: 'randevulu' }, aciklama: 'Randevulu' };
  m.adimlar[1].bolumler[0].alanlar.push(
    { id: 'teslimatTuru', tip: 'secim', etiket: { ekran: 'Teslimat türü' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'teslimatTuru' }, konum: { secici: '#tt', kirilganlik: 'orta' }, zorunlu: false,
      seceneklerDurumu: 'tam', secenekler: [{ deger: 'standart', metin: 'Standart' }, { deger: 'hizli', metin: 'Hızlı' }, { deger: 'randevulu', metin: 'Randevulu' }] },
    { id: 'randevuSaati', tip: 'metin', etiket: { ekran: 'Randevu saati' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'randevuSaati' }, konum: { secici: '#rs', kirilganlik: 'orta' }, zorunlu: false, gorunurluk: { kosul: 'randevulu' } }
  );
  const d = senaryoOnerileri(girdi(m, [TABAN]));
  const tt = kimlikler(d.oneriler, 'kosullu').filter((k) => k.startsWith('kosullu:teslimatTuru'));
  expect(tt.sort()).toEqual(['kosullu:teslimatTuru=randevulu', 'kosullu:teslimatTuru=standart']);
  expect(d.kapsam.dallar.eksikler).toContain('Teslimat türü = Standart');
  expect(d.kapsam.dallar.eksikler).not.toContain('Teslimat türü = Hızlı');
});

test('pairwise açıkken denenmemiş dal pairwise satırına katılır: ayrı öneri kalmaz, satırın gerekçesi dalı söyler', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN], { kombinasyonAlanlari: undefined }));
  expect(s.kombinasyon.secili).toEqual(TUM_SECIM); // varsayılan: koşul yöneten + seçenekli alanlar
  expect(kimlikler(s.oneriler, 'kosullu')).toEqual([]);
  const dallar = s.oneriler.flatMap((o) => o.dallar ?? []);
  expect(dallar.sort()).toEqual(['Hediye paketi = işaretli', 'Kategori = Elektronik', 'Kategori = Giyim']);
  const dalli = s.oneriler.find((o) => (o.dallar ?? []).includes('Kategori = Giyim')) as Oneri;
  expect(dalli).toMatchObject({ tur: 'kombinasyon', neden: 'kapsam' });
  expect(dalli.gerekce).toMatch(/^(“[^”]+” ve )?“Kategori = Giyim”( ve “[^”]+”)? dall?a?r?ı hiç denenmedi; .+ hiç birlikte denenmedi/);
});

// ---- Risk ve öğrenme -----------------------------------------------------------------------------------

test('risk: hata geçmişi olan değerin eksik ikilileri öne çıkar; test edilmemiş uyarı → beklenen mesajlı hata senaryosu önerisi', () => {
  const model = siparisModeli();
  const hatali: OneriSenaryosu = { id: 's2', baslik: 'Elektronik beyaz', veri: { ...tabanVerisi('03.10.2026'), kategori: 'elektronik', renk: 'beyaz' }, sonDurum: 'basarisiz' };
  const s = senaryoOnerileri(girdi(model, [TABAN, hatali], {
    kombinasyonAlanlari: TUM_SECIM,
    gecmis: {
      hataGunu: 14, uyariGunu: 90,
      hatalar: [{ senaryoId: 's2', adim: 'Ürün seçimi', sayi: 3 }],
      uyarilar: [{ metin: 'Stokta yeterli ürün yok.', adim: 'Ürün seçimi', sayi: 4, beklenen: false, senaryoIdleri: ['s2'] }]
    }
  }));
  // İlk öneriler risk: uyarı (4 kez) ve elektronik içeren eksik ikili.
  expect(s.oneriler[0].neden).toBe('risk');
  const uyari = s.oneriler.find((o) => o.tur === 'uyari') as Oneri;
  expect(uyari).toMatchObject({
    neden: 'risk', eklenebilir: true, engel: null,
    gerekce: '“Stokta yeterli ürün yok.” uyarısını beklenen sonuç olarak taşıyan senaryo yok (son 90 günde 4 kez görüldü)',
    beklenen: { tur: 'hata', adim: 'urun', mesaj: 'Stokta yeterli ürün yok.' }
  });
  // Tetikleyen senaryonun değerleriyle; beklenen mesaj o uyarı.
  expect(uyari.veri).toMatchObject({ kategori: 'elektronik', renk: 'beyaz', beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'urun', mesaj: 'Stokta yeterli ürün yok.' } });
  expect(dogrula(model, uyari.veri).hatalar).toEqual([]);
  expect(s.kapsam.uyarilar).toEqual({ kapsanan: 0, toplam: 1, eksikler: ['Stokta yeterli ürün yok.'] });
  const riskli = s.oneriler.filter((o) => o.tur === 'kombinasyon' && o.neden === 'risk');
  expect(riskli.length).toBeGreaterThan(0);
  expect(riskli[0].gerekce).toMatch(/“Kategori: Elektronik” son 14 günde 3 başarısız koşuda yer aldı; “.+” ile “.+” hiç birlikte denenmedi/);
  // Risk, aynı türün risksiz önerilerinden önce; adımın hata sayısı zorunlu / sınır gerekçesine eklenir.
  expect(Math.min(...riskli.map((o) => o.puan))).toBeGreaterThan(Math.max(...s.oneriler.filter((o) => o.neden === 'pairwise').map((o) => o.puan)));
  expect(bul(s.oneriler, 'zorunlu:adet').gerekce).toContain('“Ürün seçimi” adımı son 14 günde 3 kez hata verdi');

  // Uyarıyı bekleyen senaryo varsa (ya da koşuda beklenen olarak işaretliyse) öneri yok, kapsam tam.
  const bekleyen: OneriSenaryosu = { id: 's3', baslik: 'Stok uyarısı', veri: { ...uyari.veri, baslik: 'Stok uyarısı' } };
  const t = senaryoOnerileri(girdi(model, [TABAN, hatali, bekleyen], { gecmis: { uyarilar: [{ metin: 'Stokta yeterli ürün yok.', adim: 'Ürün seçimi', sayi: 4, beklenen: false, senaryoIdleri: ['s2'] }] } }));
  expect(t.oneriler.some((o) => o.tur === 'uyari')).toBe(false);
  expect(t.kapsam.uyarilar).toMatchObject({ kapsanan: 1, toplam: 1 });
  // Maskelenmiş parçalı uyarı doğrudan eklenemez (önizlemede düzeltilir).
  const m = senaryoOnerileri(girdi(model, [TABAN], { gecmis: { uyarilar: [{ metin: 'Kayıt ••• bulunamadı', adim: 'Ürün seçimi', sayi: 1, beklenen: false, senaryoIdleri: ['s1'] }] } }));
  expect((m.oneriler.find((o) => o.tur === 'uyari') as Oneri)).toMatchObject({ eklenebilir: false, engel: expect.stringContaining('maskelenmiş') });
});

test('öğrenme: reddedilen türün puanı düşer, kabul edilenin yükselir; reddedilen gizlenir, "sonra" bir hafta', () => {
  const model = siparisModeli();
  const olay = (k: Partial<OneriKarari>): OneriKarari => ({ zaman: '2026-09-27T10:00:00.000Z', ekranId: 'e1', kimlik: 'x', tur: 'sinir', karar: 'red', alanlar: [], ...k });
  const puan = (liste: Oneri[], kimlik: string) => bul(liste, kimlik).puan;
  const yalin = senaryoOnerileri(girdi(model, [TABAN], { ekranId: 'e1' })).oneriler;
  const red = senaryoOnerileri(girdi(model, [TABAN], { ekranId: 'e1', kararlar: [olay({}), olay({ kimlik: 'y' })] })).oneriler;
  expect(puan(red, 'sinir:adet:0')).toBeLessThan(puan(yalin, 'sinir:adet:0'));
  expect(puan(red, 'zorunlu:adet')).toBe(puan(yalin, 'zorunlu:adet'));
  const kabul = senaryoOnerileri(girdi(model, [TABAN], { ekranId: 'e1', kararlar: [olay({ karar: 'kabul', tur: 'zorunlu' })] })).oneriler;
  expect(puan(kabul, 'zorunlu:adet')).toBeGreaterThan(puan(yalin, 'zorunlu:adet'));
  // Alan ağırlığı (bu ekran): "Adet" alanı reddedildikçe adet önerileri geriler.
  const alanRed = senaryoOnerileri(girdi(model, [TABAN], { ekranId: 'e1', kararlar: [olay({ tur: 'kosullu', alanlar: ['adet'] })] })).oneriler;
  expect(puan(alanRed, 'zorunlu:adet')).toBeLessThan(puan(yalin, 'zorunlu:adet'));

  // Reddedilen gizlenir (bu ekranda); "sonra" 7 gün; reddedilenleriGoster ile işaretli döner.
  const kararlar = [olay({ kimlik: 'sinir:adet:0' }), olay({ kimlik: 'sinir:adet:11', redNedeni: 'sonra' }), olay({ kimlik: 'sinir:adet:1', redNedeni: 'sonra', zaman: '2026-09-10T10:00:00.000Z' })];
  const g = senaryoOnerileri(girdi(model, [TABAN], { ekranId: 'e1', kararlar }));
  expect(kimlikler(g.oneriler)).not.toContain('sinir:adet:0');
  expect(kimlikler(g.oneriler)).not.toContain('sinir:adet:11');
  expect(kimlikler(g.oneriler)).toContain('sinir:adet:1'); // erteleme süresi geçti
  expect(g.elenen).toMatchObject({ reddedilen: 1, ertelenen: 1 });
  expect(kimlikler(senaryoOnerileri(girdi(model, [TABAN], { ekranId: 'e2', kararlar })).oneriler)).toContain('sinir:adet:0'); // başka ekran
  const goster = senaryoOnerileri(girdi(model, [TABAN], { ekranId: 'e1', kararlar, reddedilenleriGoster: true }));
  expect(bul(goster.oneriler, 'sinir:adet:0').reddedildi).toBe(true);
});

// ---- Kapsam, sıralama, üst sınır, gizli alanlar ----------------------------------------------------------

test('kapsam ölçüleri: alanlar, koşul dalları, ikililer, uyarılar (x / y + eksikler)', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN], { kombinasyonAlanlari: ['kategori', 'renk'] }));
  // 11 ekran alanı; tabanda değerli: ürün adı, adet, kategori, renk, teslimat tarihi, telefon.
  expect(s.kapsam.alanlar).toEqual({ kapsanan: 6, toplam: 11, eksikler: ['Beden', 'Sipariş notu', 'Kupon kodu', 'Hediye paketi', 'Hediye notu'] });
  expect(s.kapsam.ikililer).toMatchObject({ kapsanan: 1, toplam: 5 });
  expect(s.kapsam.ikililer.eksikler).toContain('Kategori: Giyim + Renk: Mavi');
  expect(s.kapsam.uyarilar).toEqual({ kapsanan: 0, toplam: 0, eksikler: [] });
});

test('sıralama: risk › kapsam › pairwise › sınır › zorunlu; üst sınır (varsayılan 10) ve kalan', () => {
  const model = siparisModeli();
  // Kitap + hediye ve giyim denenmiş; elektronik dalı denenmemiş (kapsam), eksik ikililer (pairwise), uyarı (risk).
  const hediyeli: OneriSenaryosu = { id: 's5', baslik: 'Hediyeli', veri: { ...tabanVerisi('03.10.2026'), hediyePaketi: true, hediyeNotu: 'Not' } };
  const giyim: OneriSenaryosu = { id: 's6', baslik: 'Giyim', veri: { ...tabanVerisi('03.10.2026'), kategori: 'giyim', renk: 'kirmizi', beden: 'S' } };
  const s = senaryoOnerileri(girdi(model, [TABAN, hediyeli, giyim], {
    kombinasyonAlanlari: ['kategori', 'hediyePaketi'],
    gecmis: { uyarilar: [{ metin: 'Stok yok.', adim: 'Ürün seçimi', sayi: 1, beklenen: false, senaryoIdleri: ['s1'] }] }
  }));
  const sira = s.oneriler.map((o) => NEDEN_PUANLARI[o.neden]);
  expect([...sira]).toEqual([...sira].sort((a, b) => b - a));
  expect(s.oneriler.map((o) => o.neden).filter((n, i, l) => l.indexOf(n) === i)).toEqual(['risk', 'kapsam', 'pairwise', 'sinir', 'zorunlu']);
  for (let i = 1; i < s.oneriler.length; i++) expect(s.oneriler[i - 1].puan).toBeGreaterThanOrEqual(s.oneriler[i].puan);

  const k = senaryoOnerileri(girdi(model, [TABAN], { ustSinir: undefined }));
  expect(k.oneriler).toHaveLength(ONERI_UST_SINIRI);
  expect(k.kalan).toBe(k.toplam - ONERI_UST_SINIRI);
  expect(k.oneriler).toEqual(senaryoOnerileri(girdi(model, [TABAN])).oneriler.slice(0, ONERI_UST_SINIRI));
});

test('kişisel / gizli alanda değer üretilmez; hassas ve kayıt tablosuna bağlı alan pairwise / dal önerisine girmez', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN], { kombinasyonAlanlari: undefined }));
  expect(s.oneriler.some((o) => o.kimlik.startsWith('sinir:telefon'))).toBe(false);
  expect(s.notlar.map((n) => n.mesaj).join('\n')).toContain('"Telefon" kişisel / gizli bir alan: sınır değeri üretilmez');
  for (const o of s.oneriler) {
    expect([TELEFON, undefined], o.kimlik).toContain(o.veri.telefon);
    expect(JSON.stringify([o.baslik, o.gerekce, o.ozet, o.degisiklikler, o.ikililer]), o.kimlik).not.toContain(TELEFON);
  }
  // Senaryo yokken taban modelin varsayılanları; telefon bağlı tablonun başvurusuyla dolar.
  const bos = senaryoOnerileri(girdi(model, [], { tabloBasvurulari: { telefon: '${Müşteriler.Telefon}' } }));
  expect(bos.taban).toMatchObject({ kaynak: 'varsayilan', eksikler: ['Ürün adı', 'Kategori', 'Teslimat tarihi'] });
  for (const o of bos.oneriler) expect(['${Müşteriler.Telefon}', undefined], o.kimlik).toContain(o.veri.telefon);
  expect(bul(bos.oneriler, 'zorunlu:adet')).toMatchObject({ eksikler: ['Ürün adı', 'Kategori', 'Teslimat tarihi'], eklenebilir: false });

  // Hassas seçim alanı: pairwise'a ve dallara girmez.
  const gizliModel = siparisModeli();
  gizliModel.adimlar[0].bolumler[0].alanlar[2].hassas = true;
  const g = senaryoOnerileri(girdi(gizliModel, [TABAN], { kombinasyonAlanlari: ['kategori', 'renk'] }));
  expect(g.kombinasyon.secilebilir.map((x) => x.id)).not.toContain('kategori');
  expect(g.oneriler.some((o) => o.kimlik.includes('kategori='))).toBe(false);
  // Kayıt tablosuna bağlı alan (Hazır / Yeni kayıt grubu) değişmez; satır seçimi tabandan korunur.
  const kayitli: OneriSenaryosu = { ...TABAN, tabloSecimleri: { 't1|': { Ad: 'kayit-1' } } };
  const h = senaryoOnerileri(girdi(model, [kayitli], { kombinasyonAlanlari: undefined, haricAlanlar: ['kategori'] }));
  expect(h.kombinasyon.secilebilir.map((x) => x.id)).not.toContain('kategori');
  for (const o of h.oneriler) {
    if (o.tur !== 'zorunlu') expect(o.veri.kategori, o.kimlik).toBe('kitap');
    expect(o.tabloSecimleri).toEqual({ 't1|': { Ad: 'kayit-1' } });
  }
  expect(MASKE).toMatch(/^•+$/);
});

test('eklenen öneri tekrar üretilince yeni bir şey kapsamadığı için listede yer almaz', () => {
  const model = siparisModeli();
  const ilk = senaryoOnerileri(girdi(model, [TABAN]));
  const eklenecek = [bul(ilk.oneriler, 'zorunlu:adet'), bul(ilk.oneriler, 'sinir:adet:10'), bul(ilk.oneriler, 'kosullu:kategori=elektronik')];
  const kayitlilar: OneriSenaryosu[] = [TABAN, ...eklenecek.map((o, i) => ({ id: `y${i}`, baslik: o.baslik, veri: o.veri }))];
  const ikinci = senaryoOnerileri(girdi(model, kayitlilar));
  for (const o of eklenecek) expect(kimlikler(ikinci.oneriler)).not.toContain(o.kimlik);
  expect(ikinci.elenen.kapsanan).toBeGreaterThanOrEqual(ilk.elenen.kapsanan + 3);
  expect(ikinci.taban.senaryoId).toBe('s1');
  expect(kimlikler(ikinci.oneriler)).toContain('zorunlu:urunAdi');
});

test('modelde beklenen sonuç yoksa hata beklentisi kurulmaz: "siz seçin"', () => {
  const model = siparisModeli();
  model.senaryoDuzeyi.alanlar = model.senaryoDuzeyi.alanlar.filter((a: Nesne) => a.tip !== 'birlesim');
  const s = senaryoOnerileri(girdi(model, [TABAN]));
  expect(bul(s.oneriler, 'zorunlu:adet').beklenen.tur).toBe('belirsiz');
  expect(bul(s.oneriler, 'sinir:adet:0').beklenen.tur).toBe('belirsiz');
  expect(bul(s.oneriler, 'sinir:adet:1').beklenen.tur).toBe('basari');
});
