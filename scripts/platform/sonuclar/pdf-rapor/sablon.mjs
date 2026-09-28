// PDF RAPORU — HTML şablonu (saf): rapor verisinden (sonuclar/donem-raporu.mjs) tek ekran ve tek servis raporunun HTML'i.
// İskelet: Tek bakışta → Ele alınması gerekenler → Sorunlar ve eğilimleri → Eğilim → Kapsamdaki öğeler → türe özgü bölümler →
// Yöntem + gizlilik. Sayfa JS'siz ve dış kaynaksızdır (satır içi CSS + SVG; CSP default-src 'none'); PDF'e pdf.mjs basar.
// Tüm kullanıcı verisi kaçışlanır; ad alanları bilinen gizli değerlerle, serbest metinler tam maskeleyiciyle (html-rapor.mjs >
// raporMaskeleyici — gizli değerler, adı gizli alanlar, e-posta, uzun rakam, sorgu dizesi, ortam adresi) maskelenir.
import { kacis } from '../html-rapor.mjs';
import {
  CSS, aksiyonTablosu, fark, isiHaritasi, kart, renkOran, senaryoMatrisi, sonHap, sorunTablosu, sure, sureDagilimi, sureGrafigi, sy, tarihSaat, tekBakista,
  trendGrafigi, yontemKutusu, yz
} from './bilesenler.mjs';
import { SERVIS_HATA_TURLERI } from '../sorun-modeli.mjs';

/** @typedef {import('../donem-raporu.mjs').DonemRaporuVerisi} Veri */

/**
 * @param {any} v rapor verisi (donemRaporuVerisi çıktısı)
 * @param {{ maskele: (m: unknown) => string; adMaskele: (m: unknown) => string }} s
 * @returns {{ html: string; baslik: string }}
 */
export function pdfRaporHtml(v, s) {
  const e = (/** @type {unknown} */ x) => kacis(s.adMaskele(x));
  const m = (/** @type {unknown} */ x) => kacis(s.maskele(x));
  const servis = v.tur === 'servis';
  const baslik = servis ? `Servis Raporu — ${v.oge.ad}${v.oge.servisTuru ? ` (${String(v.oge.servisTuru).toUpperCase()})` : ''}` : `Ekran Raporu — ${v.oge.ad}`;
  const alt = servis ? 'Tek servis: metot bazında başarı, yanıt süresi, hata türleri ve sorun eğilimleri'
    : 'Tek ekran: güncel durum, ele alınması gerekenler, sorunların eğilimi, senaryo ve adım ayrıntısı';
  const ortamMetni = v.ortam ? e(v.ortam.ad) : 'Tüm ortamlar';
  const secenekler = [`Ekran görüntüsü: ${v.secenekler.goruntuler ? 'açık' : 'kapalı'}`, `Hata ayrıntısı: ${v.secenekler.hatalar ? 'açık' : 'kapalı'}`,
    `Ortam adresi: ${v.secenekler.adres ? 'açık' : 'gizli'}`].join(' · ');
  const meta = [
    ['Proje', e(v.proje.ad)], ['Kapsam', servis ? 'Tek servis' : 'Tek ekran'], ['Dönem', `${kacis(v.donem.etiket)} (${v.donem.gun} gün)`],
    ['Karşılaştırılan dönem', v.karsilastir ? kacis(v.donem.oncekiEtiket) : 'Kapalı'],
    ['Ortam', `${ortamMetni}${v.secenekler.adres && v.ortam?.adres ? `<br><span class="mono">${m(v.ortam.adres)}</span>` : ''}`],
    ['Seçilenler', servis ? `${e(v.oge.ad)} (${v.oge.metotSayisi} metot, ${v.oge.senaryoSayisi} senaryo)` : `${e(v.oge.ad)} (${v.oge.senaryoSayisi} senaryo)`],
    ['Oluşturulma', `${kacis(tarihSaat(v.olusturma))} · Nöbetçi`], ['Seçenekler', kacis(secenekler)]
  ];
  const k = !v.karsilastir;
  let no = 0;
  const h2 = (/** @type {string} */ metin, ek = '') => `<h2 class="${ek}"><span class="no">${++no}</span>${kacis(metin)}</h2>`;
  const esik = v.esikler;
  const o = v.ozet;
  const acikNot = `<span class="kotu fk">${v.durumSayim.yeni} yeni · ${v.durumSayim.artan} artan · ${v.durumSayim.tekrar} tekrar eden</span> <span class="iyi fk">${v.durumSayim.cozulen} çözülen</span>`;
  const kartlar = servis ? [
    kart('Başarı oranı', yz(o.basari), `${fark(o.basari, o.oncekiBasari, { birim: 'puan', b: 1, kapali: k })} ${k ? '' : `<span class="notr">önceki ${yz(o.oncekiBasari)}</span>`}`, renkOran(o.basari, esik)),
    kart('Servis çağrısı', sy(o.cagri), `${fark(o.cagri, o.oncekiCagri, { yon: 'notr', kapali: k })} <span class="notr">${v.oge.metotSayisi} metot · ${v.oge.senaryoSayisi} senaryo</span>`),
    kart('Başarısız + hata', sy(o.kalan), `${fark(o.kalan, o.oncekiKalan, { yon: 'asagi-iyi', kapali: k })}${k || o.oncekiKalan === null ? '' : ` <span class="notr">önceki ${sy(o.oncekiKalan)}</span>`}`, o.kalan ? 'kotu' : ''),
    kart('En yavaş p95', o.enYavas ? kacis(sure(o.enYavas.p95)) : '—', o.enYavas ? `<span class="notr">${e(o.enYavas.metot)}</span> ${fark(o.enYavas.p95, o.enYavas.oncekiP95, { yon: 'asagi-iyi', birim: 'ms', kapali: k })}` : '<span class="notr">ölçüm yok</span>'),
    kart('Yavaşlayan metot', sy(o.yavaslayan), '<span class="notr">p95 ≥ %20 arttı (≥ 20 ölçüm)</span>', o.yavaslayan ? 'kotu' : ''),
    kart('Açık sorun', sy(o.acikSorun), acikNot)
  ] : [
    kart('Dönem başarı oranı', yz(o.basari), `${fark(o.basari, o.oncekiBasari, { birim: 'puan', b: 1, kapali: k })} ${k ? '' : `<span class="notr">önceki ${yz(o.oncekiBasari)}</span>`}`, renkOran(o.basari, esik)),
    kart('Koşulan test', sy(o.test), `${fark(o.test, o.oncekiTest, { yon: 'notr', kapali: k })} <span class="notr">${o.tamKosu} tam koşu</span>`),
    kart('Başarısız sonuç', sy(o.basarisiz), `${fark(o.basarisiz, o.oncekiBasarisiz, { yon: 'asagi-iyi', kapali: k })}${k || o.oncekiBasarisiz === null ? '' : ` <span class="notr">önceki ${sy(o.oncekiBasarisiz)}</span>`}`, o.basarisiz ? 'kotu' : ''),
    kart('Açık sorun', sy(o.acikSorun), acikNot),
    kart('Kararsız senaryo', sy(o.kararsizSenaryo), `${fark(o.kararsizSenaryo, o.oncekiKararsizSenaryo, { yon: 'asagi-iyi', kapali: k })}`),
    kart('Ort. test süresi', kacis(sure(o.ortSure)), `${fark(o.ortSure, o.oncekiOrtSure, { yon: 'asagi-iyi', birim: 'ms', kapali: k })}`)
  ];
  let govde = tekBakista({ no: ++no, rozet: v.rozet, kartlar, maddeler: v.maddeler, m });
  if (!v.kosuVar) govde += `<p class="not">Bu dönemde koşu yok${v.ortam ? ` (ortam: ${ortamMetni})` : ''}. Sayılar boştur; dönemi genişletin ya da koşuyu başlatın.</p>`;
  if (v.karsilastir && !servis && o.oncekiTest === null) govde += '<p class="kucuk">Önceki dönem verisi yok, fark gösterilmiyor.</p>';
  govde += aksiyonTablosu({ no: ++no, aksiyonlar: v.aksiyonlar, bantSayim: v.bantSayim, e, m });
  govde += sorunTablosu({ no: ++no, sorunlar: v.sorunlar, hatalar: v.secenekler.hatalar, karsilastir: v.karsilastir, kosuVar: v.kosuVar, m });
  govde += `${h2('Eğilim')}${trendGrafigi({
    kovalar: v.egilim.kovalar, oncekiOrt: v.egilim.oncekiOrt, esikler: esik, karsilastir: v.karsilastir, adetEtiketi: servis ? 'Servis çağrısı' : 'Koşulan test (tam koşu)',
    baslik: `${v.donem.kirilim === 'gunluk' ? 'Günlük' : 'Haftalık'} başarı ve ${servis ? 'çağrı sayısı' : 'koşulan test'}`
  })}`;
  govde += servis ? servisBolumleri(v, { e, m, h2, k }) : ekranBolumleri(v, { e, m, h2, k });
  govde += yontemKutusu(servis ? [
    ['Süre', 'Servis süresi = isteğin gönderilmesinden yanıtın tamamlanmasına kadar. p50 / p95 / p99: en yakın sıra yöntemi; “hata” (yanıt yok) süreye girmez; p99 yalnız 20+ ölçümde.'],
    ['Metot', 'SOAP operasyonu / REST “YÖNTEM yol” (sorgu dizesi olmadan); senaryonun içeriğinden okunur. Hata kalıbında kontrolün yalnız türü ve yolu yazar (değer yok).']
  ] : [
    ['Adım ısı haritası', 'Her başarısız sonuç yalnız ilk başarısız adımına sayılır; tekrar denemesinde (retry) son deneme esas alınır.'],
    ['Tekil koşular', 'Tek ▷ ve “Seçilenleri çalıştır” koşuları sorunlara girer, başarı oranına girmez.']
  ]);
  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>${e(baslik)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="ust"><div><h1>${e(baslik)}</h1><div class="alt">${kacis(alt)}</div></div><span class="etiket-nobetci">Nöbetçi raporu</span></div>
<div class="meta">${meta.map(([a, b]) => `<div><b>${kacis(a)}</b>${b}</div>`).join('')}</div>
${govde}
</main>
</body>
</html>
`;
  return { html, baslik };
}

/** @typedef {{ e: (x: unknown) => string; m: (x: unknown) => string; h2: (metin: string, ek?: string) => string; k: boolean }} Yazim */

/** @param {any} v @param {Yazim} y */
function ekranBolumleri(v, y) {
  const x = v.ekran;
  const { e, m, h2, k } = y;
  let h = `${h2('Senaryolar', 'sayfa-sonu')}`;
  h += x.matris.etiketler.length ? `<h3>Senaryo matrisi — son ${x.matris.etiketler.length} tam koşu</h3>${senaryoMatrisi(x.matris, e)}` : '<p class="bos">Bu dönemde tam koşu yok; senaryo matrisi boş.</p>';
  h += `<h3>Senaryo özeti (dönem, tam koşular)</h3>`;
  h += x.senaryolar.length ? `<table><thead><tr><th scope="col">Senaryo</th><th scope="col" class="s">Koşu</th><th scope="col" class="s">Başarı</th>${k ? '' : '<th scope="col" class="s">Önceki</th><th scope="col">Fark</th>'}<th scope="col" class="s">Ort. süre</th><th scope="col" class="s">p95 süre</th><th scope="col">Kararlılık</th></tr></thead><tbody>
${x.senaryolar.map((/** @type {any} */ s) => `<tr><td>${e(s.ad)}</td><td class="s">${s.kosu}</td><td class="s ${renkOran(s.hepAtlandi ? null : s.basari, v.esikler)}"><b>${s.hepAtlandi ? '—' : yz(s.basari)}</b>${s.hepAtlandi ? ' <span class="kucuk">(hep atlandı)</span>' : s.hicKosmadi ? ' <span class="kucuk">(koşmadı)</span>' : ''}</td>${k ? '' : `<td class="s notr">${yz(s.oncekiBasari)}</td><td>${s.hepAtlandi || s.hicKosmadi ? '' : fark(s.basari, s.oncekiBasari, { birim: 'puan', b: 1 })}</td>`}<td class="s">${kacis(sure(s.ortSure))}</td><td class="s">${kacis(sure(s.p95))}</td><td class="kucuk">${s.kararlilik ? (s.kararlilik.durum === 'kararsiz' ? '<span class="kotu">≈ kararsız</span>' : s.kararlilik.durum === 'izlenir' ? '<span class="orta">izlenir</span>' : 'kararlı') : '—'}</td></tr>`).join('')}
</tbody></table>` : '<p class="bos">Bu ekranın senaryosu yok.</p>';
  h += h2('Adım bazında hatalar');
  h += x.isiHaritasi.length ? isiHaritasi({ satirlar: x.isiHaritasi, etiketler: v.donem.kovaEtiketleri, baslik: `Adım × ${v.donem.kirilim === 'gunluk' ? 'gün' : 'hafta'}: kalan test adedi`, m }) : '<p class="bos">Bu dönemde kalan test yok.</p>';
  const sonHata = x.sonHata
    ? `<div class="blok"><h3>Beklenen / görülen — son hata</h3><table><tbody>
<tr><th scope="row" style="width:80px">Senaryo</th><td>${e(x.sonHata.senaryo)}</td></tr>${x.sonHata.adim ? `<tr><th scope="row">Adım</th><td>${m(x.sonHata.adim)}</td></tr>` : ''}
${x.sonHata.beklenen !== null ? `<tr><th scope="row">Beklenen</th><td class="mono">${m(x.sonHata.beklenen || '—')}</td></tr>` : ''}${x.sonHata.gorulen !== null ? `<tr><th scope="row">Görülen</th><td class="mono">${m(x.sonHata.gorulen || '—')}</td></tr>` : ''}
<tr><th scope="row">Zaman</th><td>${kacis(tarihSaat(x.sonHata.zaman))}${x.sonHata.ortam ? ` · ${e(x.sonHata.ortam)}` : ''}</td></tr></tbody></table>
${x.sonHata.metin ? `<pre aria-label="Hata mesajı (ilk satırlar)">${m(x.sonHata.metin)}</pre>` : ''}
${(x.sonHata.goruntuler ?? []).filter((/** @type {any} */ g) => /^image\/(png|jpeg|webp|gif)$/.test(g.icerikTuru) && /^[A-Za-z0-9+/=]+$/.test(g.base64))
    .map((/** @type {any} */ g) => `<figure><img src="data:${g.icerikTuru};base64,${g.base64}" alt="${e(`${x.sonHata.senaryo} — ekran görüntüsü`)}"><figcaption>${e(g.ad)}</figcaption></figure>`).join('')}</div>`
    : `<div class="blok"><h3>Beklenen / görülen — son hata</h3><p class="bos">${v.secenekler.hatalar ? 'Bu dönemde kalan test yok.' : 'Hata ayrıntısı seçenekte kapalı.'}</p></div>`;
  const yakalanan = `<div class="blok"><h3>Koşuda yakalanan beklenmeyen mesajlar</h3>${x.yakalanan.length ? `<table><thead><tr><th scope="col">Kaynak</th><th scope="col">Mesaj kalıbı (maskeli)</th><th scope="col" class="s">Test</th></tr></thead><tbody>
${x.yakalanan.map((/** @type {any} */ y2) => `<tr><td class="kucuk">${kacis(KAYNAK[y2.kaynak] ?? y2.kaynak)}</td><td class="mono">${m(y2.kalip)}</td><td class="s">${y2.test}${y2.kalanTest ? ` <span class="kucuk kotu">(${y2.kalanTest} kalan)</span>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="bos">Beklenmeyen mesaj yakalanmadı.</p>'}</div>`;
  h += `<div class="iki">${sonHata}${yakalanan}</div>`;
  const kp = x.kapsam;
  h += `${h2('Kapsam')}<table><tbody>
<tr><td>Senaryo (koşuya dahil)</td><td class="s">${kp.senaryo} (${kp.kosuyaDahil})</td></tr>
<tr><td>Dönemde hiç koşmayan senaryo (koşuya dahil)</td><td class="s ${kp.hicKosmayan ? 'kotu' : ''}">${kp.hicKosmayan}</td></tr>
<tr><td>Dönemde hep atlanan senaryo</td><td class="s ${kp.hepAtlanan ? 'kotu' : ''}">${kp.hepAtlanan}</td></tr>
<tr><td>Model sürümü</td><td class="s">${kp.modelSurumu ? `v${kp.modelSurumu.surum} · ${kacis(tarihSaat(kp.modelSurumu.tarih).slice(0, 10))}` : '—'}</td></tr>
</tbody></table><p class="kucuk">Model alan kapsamı ve senaryosu olmayan alan grupları sonraki sürümde eklenecek.</p>`;
  return h;
}

const KAYNAK = /** @type {Record<string, string>} */ ({ diyalog: 'Diyalog', 'hata-gostergesi': 'Hata göstergesi', konsol: 'Konsol', 'sayfa-hatasi': 'Sayfa hatası', ag: 'Ağ' });

/** @param {any} v @param {Yazim} y */
function servisBolumleri(v, y) {
  const x = v.servis;
  const { e, m, h2, k } = y;
  let h = x.sureEgilimi.p95.some((/** @type {number | null} */ p) => p !== null)
    ? sureGrafigi({ etiketler: v.donem.kovaEtiketleri, p50: x.sureEgilimi.p50, p95: x.sureEgilimi.p95, oncekiP95: k ? null : x.sureEgilimi.oncekiP95, baslik: 'Yanıt süresi (tüm metotlar; p50 / p95)' })
    : '';
  h += h2('Metotlar', 'sayfa-sonu');
  h += x.metotlar.length ? `<table><thead><tr><th scope="col">Metot</th><th scope="col" class="s">Senaryo</th><th scope="col" class="s">Çağrı</th><th scope="col" class="s">Başarı</th>${k ? '' : '<th scope="col">Fark</th>'}<th scope="col" class="s">p50</th><th scope="col" class="s">p95</th>${k ? '' : '<th scope="col">p95 farkı</th>'}<th scope="col">Son</th></tr></thead><tbody>
${x.metotlar.map((/** @type {any} */ t) => `<tr><td><span class="mono" style="font-size:8pt;color:#1c2430">${e(t.ad)}</span></td><td class="s">${t.senaryo}</td><td class="s">${sy(t.cagri)}</td><td class="s ${renkOran(t.basari, v.esikler)}"><b>${yz(t.basari)}</b></td>${k ? '' : `<td>${t.cagri ? fark(t.basari, t.oncekiBasari, { birim: 'puan', b: 1 }) : ''}</td>`}<td class="s">${kacis(sure(t.p50))}</td><td class="s">${t.yavas ? '<b class="kotu">' : ''}${kacis(sure(t.p95))}${t.yavas ? '</b>' : ''}</td>${k ? '' : `<td>${t.cagri ? fark(t.p95, t.oncekiP95, { yon: 'asagi-iyi', birim: 'ms' }) : ''}${t.yavas ? ' <span class="kucuk kotu">yavaşladı</span>' : ''}</td>`}<td>${sonHap(t.son)}</td></tr>`).join('')}
</tbody></table><div class="lejant"><span>Başarı = başarılı ÷ (başarılı + başarısız + hata). “Yavaşladı”: p95 önceki döneme göre ≥ %20 arttı (≥ 20 ölçüm).</span></div>` : '<p class="bos">Bu servisin senaryosu yok.</p>';
  h += `<h3>Süre dağılımı (p50 / p95 / p99)</h3>${sureDagilimi(x.metotlar, e)}`;
  h += h2('Hata türleri ve kontroller');
  h += `<h3>Metot × hata türü</h3>${x.hataMatrisi.length ? `<table><thead><tr><th scope="col">Metot</th>${SERVIS_HATA_TURLERI.map(([, a]) => `<th scope="col" class="c">${kacis(a)}</th>`).join('')}<th scope="col" class="s">Toplam</th>${k ? '' : '<th scope="col" class="s">Önceki</th>'}</tr></thead><tbody>
${x.hataMatrisi.map((/** @type {any} */ r) => `<tr><td><span class="mono" style="color:#1c2430">${e(r.metot)}</span></td>${SERVIS_HATA_TURLERI.map(([t]) => { const n = r.sayilar[t] ?? 0; return n ? `<td class="c" style="background:${n >= 5 ? '#f7a8a3' : '#fde2e0'};font-weight:700">${n}</td>` : '<td class="c notr">·</td>'; }).join('')}<td class="s"><b>${r.toplam}</b></td>${k ? '' : `<td class="s notr">${r.onceki} ${fark(r.toplam, r.onceki, { yon: 'asagi-iyi' })}</td>`}</tr>`).join('')}
</tbody></table><div class="lejant"><span>“Kontrol kaldı” = yanıt geldi (2xx) ama senaryodaki bir kontrol tutmadı. Zaman aşımı / bağlantı: yanıt gelmedi.</span></div>` : '<p class="bos">Bu dönemde hatalı çağrı yok.</p>'}`;
  h += `<div class="iki"><div class="blok"><h3>Kontrol türüne göre</h3>${x.kontrolTurleri.length ? `<table><thead><tr><th scope="col">Kontrol</th><th scope="col" class="s">Değerlendirme</th><th scope="col" class="s">Geçme</th></tr></thead><tbody>
${x.kontrolTurleri.map((/** @type {any} */ t) => { const o = t.toplam ? (t.gecen / t.toplam) * 100 : null; return `<tr><td>${kacis(t.etiket)}</td><td class="s">${sy(t.toplam)}</td><td class="s ${renkOran(o, v.esikler)}">${yz(o)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="bos">Değerlendirilen kontrol yok.</p>'}</div>
<div class="blok"><h3>En çok kalan kontroller</h3>${x.kalanKontroller.length ? `<table><thead><tr><th scope="col">Kontrol (tür / yol)</th><th scope="col" class="s">Kalan</th></tr></thead><tbody>
${x.kalanKontroller.map((/** @type {any} */ t) => `<tr><td class="mono">${m(t.etiket)}</td><td class="s">${t.sayi}</td></tr>`).join('')}</tbody></table>` : '<p class="bos">Kalan kontrol yok.</p>'}</div></div>`;
  h += `<h3>Bu servisi kullanan akışlar</h3>${x.akislar.length ? `<table><thead><tr><th scope="col">Akış</th><th scope="col">Tür</th><th scope="col" class="s">Koşu</th><th scope="col" class="s">Başarı</th>${k ? '' : '<th scope="col">Fark</th>'}<th scope="col" class="s">Ort. süre</th><th scope="col">Son</th></tr></thead><tbody>
${x.akislar.map((/** @type {any} */ a) => `<tr><td><b>${e(a.ad)}</b><br><span class="kucuk">${a.adim} adım</span></td><td class="kucuk">${kacis(a.tur)}</td><td class="s">${a.kosu}</td><td class="s ${renkOran(a.basari, v.esikler)}"><b>${yz(a.basari)}</b></td>${k ? '' : `<td>${a.kosu ? fark(a.basari, a.oncekiBasari, { birim: 'puan', b: 1 }) : ''}</td>`}<td class="s">${kacis(sure(a.ortSure))}</td><td>${sonHap(a.son)}</td></tr>`).join('')}
</tbody></table><p class="kucuk">İlişkili akışlar yalnız gösterilir; durum rozetini etkilemez.</p>` : '<p class="bos">Bu servisi kullanan servis akışı yok.</p>'}`;
  return h;
}
