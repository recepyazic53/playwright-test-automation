// Maskeli alan + sayfada sürekli duran takvim: alandan çıkış Escape basmaz (maske Escape'te değeri geri alır), değer tek seferde yazılır;
// yeniden yazma temiz başlangıçtan (alan boş, imleç başta) yapılır. Escape hiçbir alanda basılmaz (yalnız Escape'le kapanan takvim açık
// kalır; değer korunur).
// Güvenlik: yalnızca 127.0.0.1'deki sahte sayfa.
import { expect, test, type Page } from '@playwright/test';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { acikTakvimVar, alanaYaz, alandanCik, degisimMesaji, maskeKaydirdi, takvimleriKaydet, yazmaHatasi } from '../../scripts/platform/tarama/alan-cikisi';

/**
 * Sahte sayfa:
 *  - #tel: "(___) ___ __ __" maskesi (yalnız tuşlarla biçimlenir). Escape: değer odak anındaki değere döner (geri al). Tıklama imleci
 *    ortadaki bir yuvaya koyar (tıklanan yer); odak (tıklamasız) imleci ilk boş yuvaya koyar. Yuvalar dolunca gelen hane düşer.
 *    Alandan çıkınca biçime uymayan (ham) değer silinir. ?sil=1: ilk alandan çıkışta sayfa alanı boşaltır (satır yeniden çizildi).
 *  - Sürekli görünen gömülü takvim (.ui-datepicker-inline, belge akışında) ve ekran dışına itilmiş takvim (left:-9999px).
 *  - #acik: odaktan önce zaten açık duran açılır takvim (?onceden=1).
 *  - #dt (maskesiz) / #mt (maske ipuçlu): odaklanınca açılan, YALNIZ Escape ile kapanan açılır takvim.
 * window.__tus: #tel'e gelen rakam tuşları; window.__esc: Escape sayısı.
 */
const SAYFA = String.raw`<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px sans-serif">
<p><label for="tel">Numara</label> <input id="tel" placeholder="(___) ___ __ __" autocomplete="off" style="width:240px"></p>
<p><label for="sonraki">Sonraki</label> <input id="sonraki"></p>
<p><label for="dt">Tarih</label> <input id="dt" autocomplete="off"> <label for="a1">Not 1</label> <input id="a1"></p>
<p><label for="mt">Maskeli tarih</label> <input id="mt" placeholder="__.__.____" autocomplete="off"> <label for="a2">Not 2</label> <input id="a2"></p>
<div class="ui-datepicker ui-datepicker-inline" style="width:200px;height:120px;background:#eef">gömülü takvim</div>
<div class="ui-datepicker" style="position:absolute;left:-9999px;top:0;width:200px;height:120px;display:block">ekran dışı</div>
<div id="acik" class="daterangepicker" style="position:absolute;top:300px;left:300px;width:150px;height:80px;background:#fee;display:none">açık takvim</div>
<div id="pt" class="ui-datepicker" style="display:none;position:absolute;top:200px;left:300px;width:200px;height:120px;background:#eee">açılır takvim</div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search);
  window.__tus = 0; window.__esc = 0;
  document.addEventListener('keydown', function (o) { if (o.key === 'Escape') { window.__esc++; $('pt').style.display = 'none'; } }, true);
  if (q.get('onceden') === '1') $('acik').style.display = 'block';
  ['dt', 'mt'].forEach(function (id) { $(id).addEventListener('focus', function () { $('pt').style.display = 'block'; }); });

  var T = '(___) ___ __ __', Y = [], d = [], odak = '', silindi = false, el = $('tel');
  for (var i = 0; i < T.length; i++) if (T[i] === '_') Y.push(i);
  function ciz() { var s = T.split(''); Y.forEach(function (p, i) { if (d[i]) s[p] = d[i]; }); el.value = s.join(''); }
  function oku(v) { d = []; if (/^\(.{3}\) .{3} .{2} .{2}$/.test(v)) Y.forEach(function (p, i) { if (/\d/.test(v[p])) d[i] = v[p]; }); }
  function bosMu() { return !d.some(Boolean); }
  function yuva(pos) { for (var i = 0; i < Y.length; i++) if (Y[i] >= pos) return i; return Y.length; }
  function imlec(i) { var p = i < Y.length ? Y[i] : T.length; el.setSelectionRange(p, p); }
  el.addEventListener('focus', function () {
    odak = el.value; oku(el.value);
    if (!el.value) ciz();
    setTimeout(function () { var i = 0; while (i < Y.length && d[i]) i++; imlec(i); }, 0);
  });
  el.addEventListener('click', function () { setTimeout(function () { imlec(5); }, 0); });
  el.addEventListener('keydown', function (o) {
    if (o.key === 'Escape') { o.preventDefault(); el.value = odak; oku(odak); return; }
    var a = el.selectionStart, b = el.selectionEnd;
    if (o.key === 'Backspace' || o.key === 'Delete') {
      o.preventDefault();
      if (b > a) { Y.forEach(function (p, i) { if (p >= a && p < b) d[i] = null; }); ciz(); imlec(yuva(a)); }
      else { var i = o.key === 'Backspace' ? yuva(a) - 1 : yuva(a); if (i >= 0 && i < Y.length) d[i] = null; ciz(); imlec(Math.max(i, 0)); }
      return;
    }
    if (o.key.length !== 1) return;
    o.preventDefault();
    if (!/\d/.test(o.key)) return;
    window.__tus++;
    var k = yuva(a);
    if (k >= Y.length) return;
    d[k] = o.key; ciz(); imlec(k + 1);
  });
  el.addEventListener('blur', function () {
    oku(el.value);
    if (bosMu()) { el.value = ''; d = []; }
    if (q.get('sil') === '1' && !silindi && !bosMu()) { silindi = true; d = []; el.value = ''; }
  });
</script></body>`;

async function sayfaAc(sorgu = ''): Promise<{ page: Page; kapat: () => Promise<void> }> {
  const s = await yerelSunucu(() => ({ tur: 'text/html; charset=utf-8', govde: SAYFA }));
  const t = await korumaliTarayici();
  const page = await (await t.newContext()).newPage();
  await page.goto(`${s.adres}/${sorgu}`);
  return { page, kapat: async () => { await t.close(); await s.kapat(); } };
}

const sayac = (page: Page): Promise<{ tus: number; esc: number }> => page.evaluate(() => {
  const w = window as unknown as { __tus: number; __esc: number };
  return { tus: w.__tus, esc: w.__esc };
});

test('gömülü ve ekran dışı takvim açılır takvim sayılmaz', async () => {
  const { page, kapat } = await sayfaAc();
  try {
    expect(await acikTakvimVar(page)).toBe(false);
    await page.locator('#dt').focus();
    expect(await acikTakvimVar(page)).toBe(true);
  } finally { await kapat(); }
});

test('maskeli alan + sürekli görünen takvim: tek seferde doğru yazılır, Escape basılmaz', async () => {
  const { page, kapat } = await sayfaAc();
  try {
    const l = page.locator('#tel');
    expect(await alanaYaz(l, '5421245685', { zamanAsimiMs: 5_000 })).toBe('tamam');
    await expect(l).toHaveValue('(542) 124 56 85');
    expect(await sayac(page)).toEqual({ tus: 10, esc: 0 });
  } finally { await kapat(); }
});

test('imleç ortadayken İLK yazış: imleç önce başa alınır, tek turda doğru (yeniden yazma yok)', async () => {
  const { page, kapat } = await sayfaAc();
  try {
    const l = page.locator('#tel');
    // Alan bir seçimden sonra belirip tıklanmış gibi: tıklama imleci ortadaki yuvaya koyar (sahte maske).
    await l.click();
    await expect.poll(() => l.evaluate((e) => (e as HTMLInputElement).selectionStart)).toBe(8);
    expect(await alanaYaz(l, '5442312456', { zamanAsimiMs: 5_000 })).toBe('tamam');
    await expect(l).toHaveValue('(544) 231 24 56');
    // Tek tur (10 tuş): ilk yazış doğru çıktı, yeniden yazılmadı.
    expect(await sayac(page)).toEqual({ tus: 10, esc: 0 });
  } finally { await kapat(); }
});

test('odaktan önce zaten açık takvim bu alanın sayılmaz; Escape basılmaz', async () => {
  const { page, kapat } = await sayfaAc('?onceden=1');
  try {
    const l = page.locator('#tel');
    expect(await acikTakvimVar(page)).toBe(true);
    await takvimleriKaydet(l);
    expect(await acikTakvimVar(page, { yalnizYeni: true })).toBe(false);
    expect(await alanaYaz(l, '5421245685', { zamanAsimiMs: 5_000 })).toBe('tamam');
    await expect(l).toHaveValue('(542) 124 56 85');
    expect(await sayac(page)).toEqual({ tus: 10, esc: 0 });
  } finally { await kapat(); }
});

test('sayfa değeri sildi: yeniden yazma temiz başlangıçtan (imleç başta), kayma olmaz', async () => {
  const { page, kapat } = await sayfaAc('?sil=1');
  try {
    const l = page.locator('#tel');
    expect(await alanaYaz(l, '5421245685', { zamanAsimiMs: 5_000 })).toBe('tamam');
    await expect(l).toHaveValue('(542) 124 56 85');
    // Yalnız değer tutmadığı için bir kez yeniden yazıldı (2 × 10 tuş); Escape yok.
    expect(await sayac(page)).toEqual({ tus: 20, esc: 0 });
  } finally { await kapat(); }
});

// Escape kuralı kaldırıldı (önce dene): Escape açık pencereyi (modal) kapatabilir ve maskeli değeri geri alabilir; yalnız Escape'le
// kapanan takvim açık kalır, değer korunur ve sonraki alanın yazılmasını engellemez.
test('yalnız Escape ile kapanan takvim: Escape basılmaz, değer korunur, sonraki alan yazılır', async () => {
  const { page, kapat } = await sayfaAc();
  try {
    const l = page.locator('#dt');
    await l.fill('13.04.1998');
    expect(await acikTakvimVar(page)).toBe(true);
    await alandanCik(l);
    await expect(l).toHaveValue('13.04.1998');
    expect((await sayac(page)).esc).toBe(0);
    expect(await alanaYaz(page.locator('#sonraki'), 'abc', { zamanAsimiMs: 5_000 })).toBe('tamam');
    await expect(l).toHaveValue('13.04.1998');
  } finally { await kapat(); }
});

test('maske ipuçlu alanda Escape hiç basılmaz (takvim açık kalsa bile)', async () => {
  const { page, kapat } = await sayfaAc();
  try {
    const l = page.locator('#mt');
    await l.fill('13.04.1998');
    await alandanCik(l);
    expect((await sayac(page)).esc).toBe(0);
    await expect(l).toHaveValue('13.04.1998');
  } finally { await kapat(); }
});

test('maske imleci kaydırdı: açık ileti', async () => {
  expect(maskeKaydirdi('5421245685', '(421) 245 68 55')).toBe(true);
  expect(maskeKaydirdi('5421245685', '(054) 212 45 68')).toBe(true);
  expect(maskeKaydirdi('5421245685', '(542) 124 56 85')).toBe(false);
  expect(maskeKaydirdi('13.04.1998', '02.10.2026')).toBe(false);
  expect(degisimMesaji('Numara', '5421245685', '(421) 245 68 55', 'Kimlik')).toContain('maske imleci kaydırdı');
  expect(degisimMesaji('Doğum', '13.04.1998', '02.10.2026', 'Kimlik')).toContain('“Kimlik” doldurulunca sayfa 02.10.2026 yaptı');
  const { page, kapat } = await sayfaAc();
  try {
    await page.locator('#sonraki').fill('(421) 245 68 55');
    expect(await yazmaHatasi(page.locator('#sonraki'), '5421245685', 'tutmadi', 'Numara')).toContain('maske imleci kaydırdı');
  } finally { await kapat(); }
});
