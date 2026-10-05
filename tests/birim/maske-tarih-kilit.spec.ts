// KORUMA TESTLERİ — normal koşuda üç ortak kural birlikte (127.0.0.1'deki sahte sayfa; ayrı Nöbetçi, geçici veritabanı; dış istek yok):
//  1) Maskeli telefon + sayfada sürekli duran gömülü takvim: numara BİR KEZ tuşlanır, Escape basılmaz (alan-cikisi.ts).
//  2) Tuş + değer engelli (datepicker benzeri) tarih alanı: betikle yazan doldurucuda (tarihJs) kilit sayılmaz, değer yazılır; aynı
//     engelli alanda tuşla yazan doldurucu ve kapalı takvim kilitli kalır (alan-kilitleri.mjs > kilitEngeller).
//  3) Zorunlu olmayan alanın tablo hücresi boş: alan doldurulmaz, koşu geçer, sonuçta not (ekran-basvurulari.mjs).
// Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { alanKilidi } from '../../scripts/platform/tarama/sayfa-envanteri';
import { BETIKLE_YAZAN_DOLDURUCULAR, kilitEngeller } from '../../scripts/platform/tarama/alan-kilitleri.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const YOL = '/sorgu-formu/';

/**
 * Sahte sayfa: #tel "(___) ___ __ __" maskesi (yalnız tuşlarla; Escape değeri odak anındaki değere döndürür; rakam tuşları sayılır),
 * #kimlik, #dogum (datepicker sınıfı; tuş + değer engelli; betikle değer alır), #tuslu (aynı engel), #kapali (kapalı takvim),
 * #not, sürekli görünen gömülü takvim. "Sorgula": doğum tarihi boşsa "Doğum tarihi zorunludur", değilse değerleri POST eder.
 */
const SAYFA = String.raw`<!doctype html><meta charset="utf-8"><title>Sorgu</title><body>
<h1>Sorgu formu</h1>
<p><label for="tel">Telefon</label> <input id="tel" placeholder="(___) ___ __ __" autocomplete="off"></p>
<p><label for="kimlik">Kimlik no</label> <input id="kimlik" autocomplete="off"></p>
<p><label for="dogum">Doğum tarihi</label> <input id="dogum" class="hasDatepicker" autocomplete="off" onkeypress="return false;" onpaste="return false;" onchange="return false;"></p>
<p><label for="tuslu">Tuşlu tarih</label> <input id="tuslu" class="hasDatepicker" autocomplete="off" onkeypress="return false;" onchange="return false;"></p>
<p><label for="kapali">Kapalı tarih</label> <input id="kapali" class="hasDatepicker ui-state-disabled" autocomplete="off"></p>
<p><label for="not">Not</label> <input id="not" autocomplete="off"></p>
<div class="ui-datepicker ui-datepicker-inline" style="width:220px;height:120px;background:#eef">gömülü takvim</div>
<p><button type="button" id="sorgula">Sorgula</button></p>
<div id="hata" role="alert" hidden></div><div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  window.__tus = 0; window.__esc = 0;
  document.addEventListener('keydown', function (o) { if (o.key === 'Escape') window.__esc++; }, true);
  var T = '(___) ___ __ __', Y = [], d = [], odak = '', el = $('tel');
  for (var i = 0; i < T.length; i++) if (T[i] === '_') Y.push(i);
  function ciz() { var s = T.split(''); Y.forEach(function (p, i) { if (d[i]) s[p] = d[i]; }); el.value = s.join(''); }
  function oku(v) { d = []; if (/^\(.{3}\) .{3} .{2} .{2}$/.test(v)) Y.forEach(function (p, i) { if (/\d/.test(v[p])) d[i] = v[p]; }); }
  function yuva(pos) { for (var i = 0; i < Y.length; i++) if (Y[i] >= pos) return i; return Y.length; }
  function imlec(i) { var p = i < Y.length ? Y[i] : T.length; el.setSelectionRange(p, p); }
  el.addEventListener('focus', function () { odak = el.value; oku(el.value); if (!el.value) ciz(); setTimeout(function () { var i = 0; while (i < Y.length && d[i]) i++; imlec(i); }, 0); });
  el.addEventListener('keydown', function (o) {
    if (o.key === 'Escape') { o.preventDefault(); el.value = odak; oku(odak); return; }
    var a = el.selectionStart, b = el.selectionEnd;
    if (o.key === 'Backspace' || o.key === 'Delete') {
      o.preventDefault();
      if (b > a) Y.forEach(function (p, i) { if (p >= a && p < b) d[i] = null; }); else { var j = o.key === 'Backspace' ? yuva(a) - 1 : yuva(a); if (j >= 0) d[j] = null; }
      ciz(); imlec(yuva(a)); return;
    }
    if (o.key.length !== 1) return;
    o.preventDefault();
    if (!/\d/.test(o.key)) return;
    window.__tus++;
    var k = yuva(a); if (k >= Y.length) return;
    d[k] = o.key; ciz(); imlec(k + 1);
  });
  el.addEventListener('blur', function () { oku(el.value); if (!d.some(Boolean)) { el.value = ''; d = []; } });
  $('sorgula').addEventListener('click', async function () {
    $('hata').hidden = true; $('sonuc').textContent = '';
    if (!$('dogum').value) { $('hata').textContent = 'Doğum tarihi zorunludur'; $('hata').hidden = false; return; }
    var g = { tel: el.value, kimlik: $('kimlik').value, dogum: $('dogum').value, tuslu: $('tuslu').value, kapali: $('kapali').value, not: $('not').value, tus: window.__tus, esc: window.__esc };
    await fetch('${YOL}sorgu', { method: 'POST', body: JSON.stringify(g) });
    $('sonuc').textContent = 'Sorgu tamam';
  });
</script></body>`;

const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
});

function paket(): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'sorgu-formu', ad: 'Sorgu formu', aciklama: 'Maske, tarih kilidi ve boş hücre (nötr fikstür).',
    ekranUrl: YOL, girisGerekmez: true, specDosyasi: 'tests/scenarios/sorgu-formu/sorgu-formu.spec.ts', pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (sorgu-formu)' }, kosullar: {},
    adimlar: [{
      id: 'sorgu', sira: 1, baslik: 'Sorgu yapılır',
      bolumler: [{ id: 'bilgiler', baslik: 'Bilgiler', alanlar: [
        alan('tel', 'metin', 'Telefon'),
        alan('kimlik', 'metin', 'Kimlik no'),
        alan('dogum', 'tarih', 'Doğum tarihi', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }),
        alan('tuslu', 'metin', 'Tuşlu tarih'),
        alan('kapali', 'tarih', 'Kapalı tarih', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }),
        alan('not', 'metin', 'Not'),
        { id: 'sorgulaDugmesi', tip: 'buton', etiket: { ekran: 'Sorgula' }, yapilandirma: 'aksiyon', konum: { secici: '#sorgula', kirilganlik: 'orta' } },
        { id: 'sonucMetni', tip: 'cikti', etiket: { ekran: 'Sorgu tamam' }, yapilandirma: 'cikti', konum: { secici: '#sonuc', kirilganlik: 'orta' } }
      ] }],
      kosu: {
        aksiyonlar: [{ tur: 'tikla', secici: '#sorgula', aciklama: 'Sorgula' }],
        basariGostergesi: { tur: 'metin', deger: 'Sorgu tamam', secici: '#sonuc' }, hataGostergesi: { secici: '#hata' }, zamanAsimiSn: 15
      }
    }],
    senaryoDuzeyi: { alanlar: [
      { id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }
    ] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'sorgu-formu', ad: 'Sorgu formu', urlYolu: YOL }, olusturan: 'test', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür; değerler sahte.' },
    model, senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] },
    bilinmeyenler: []
  };
}

test('kilit kararı: tuş + değer engeli betikle yazan doldurucuda kilit değil; tuşla yazanda ve kapalı takvimde kilit', async () => {
  const s = await yerelSunucu(() => ({ tur: 'text/html; charset=utf-8', govde: SAYFA }));
  const t = await korumaliTarayici();
  try {
    const page = await (await t.newContext()).newPage();
    await page.goto(`${s.adres}${YOL}`);
    const kilit = (id: string) => page.locator(`#${id}`).evaluate(alanKilidi);
    expect(await kilit('dogum')).toBe('tus-deger');
    expect(await kilit('kapali')).toBe('takvim-kilidi');
    expect(await kilit('tel')).toBeNull();
    expect(BETIKLE_YAZAN_DOLDURUCULAR.has('tarihJs')).toBe(true);
    expect(kilitEngeller('tus-deger', { betikle: true })).toBe(false);
    expect(kilitEngeller('tus-deger', { betikle: true, seciminGore: true })).toBe(false);
    expect(kilitEngeller('tus-deger', {})).toBe(true);
    expect(kilitEngeller('takvim-kilidi', { betikle: true })).toBe(true);
    expect(kilitEngeller('aria-devre-disi', { betikle: true })).toBe(true);
    expect(kilitEngeller('salt-okunur', {})).toBe(false);
    expect(kilitEngeller('salt-okunur', { seciminGore: true })).toBe(true);
    expect(kilitEngeller(null, { seciminGore: true })).toBe(false);
  } finally { await t.close(); await s.kapat(); }
});

test.describe('uçtan uca normal koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Sorgu-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  const sorgular: Nesne[] = [];
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const uygulama = (i: FiksturIstegi): FiksturYaniti => {
    if (i.yol === YOL || i.yol === YOL.slice(0, -1)) return { tur: 'text/html; charset=utf-8', govde: SAYFA };
    if (i.yol === `${YOL}sorgu` && i.yontem === 'POST') { sorgular.push(JSON.parse(i.govde || '{}') as Nesne); return { tur: 'application/json', govde: '{}' }; }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'maske-tarih-'));
    fikstur = await yerelSunucu(uygulama);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('telefon bir kez yazılır (Escape yok), betikle doldurulan tarih yazılır, boş hücreli alan doldurulmaz; adım geçer', async () => {
    test.setTimeout(180_000);
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    const projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Sorgu Projesi' })).proje as Nesne).id);
    const ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
    const ekranId = String(liste.ekranlar.find((e) => e.ad === 'Sorgu formu')?.id);
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Ek', sutunlar: [{ ad: 'Ad' }, { ad: 'Not' }], satirlar: [{ degerler: { Ad: 'satır 1', Not: '' } }] });
    const s = await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Uçtan uca sorgu', ortamIdleri: [ortamId],
      veri: { baslik: 'Uçtan uca sorgu', tel: '5421245685', kimlik: '10000000146', dogum: '13.04.1998', tuslu: '01.01.2000', kapali: '02.02.2002', not: '${Ek.Not}' }
    });
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: String(s.id), ortamId });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    const d = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(d.durum, JSON.stringify(d.hataMesaji)).toBe('basarili');
    expect(sorgular).toHaveLength(1);
    // Telefon tek seferde (10 rakam tuşu), Escape hiç basılmadı; betikle doldurulan tarih yazıldı.
    expect(sorgular[0]).toMatchObject({ tel: '(542) 124 56 85', kimlik: '10000000146', dogum: '13.04.1998', tus: 10, esc: 0 });
    // Tuşla yazan doldurucunun engelli alanı ve kapalı takvim yazılmadı (sayfa dolduruyor notu); boş hücreli Not doldurulmadı.
    expect(sorgular[0]).toMatchObject({ tuslu: '', kapali: '', not: '' });
    const metin = JSON.stringify(d);
    expect(metin).toContain('“Tuşlu tarih”: alan sayfa tarafından dolduruluyor');
    expect(metin).toContain('“Kapalı tarih”: alan sayfa tarafından dolduruluyor');
    expect(d.atlananAlanlar).toContainEqual({ alan: 'Not', neden: 'Ek › Not boş, doldurulmadı' });
  });
});
