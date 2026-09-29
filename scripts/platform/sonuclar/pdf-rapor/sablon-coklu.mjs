// PDF RAPORU — çoklu kapsamların gövdesi (saf): birden çok ekran, birden çok servis, ekran + servis (rapor verisi:
// donem-raporu.mjs > cokluBolumler). İskelet tek öğe raporuyla aynıdır: Tek bakışta → (karma: ekran ve servis tarafı ayrı) →
// Ele alınması gerekenler (birleşik öncelik listesi) → (karma: bağlantılı sorunlar) → Sorunlar ve eğilimleri → Eğilim →
// Kapsamdaki öğeler (sağlık sıralaması + karşılaştırma) → türe özgü bölümler → Yöntem + gizlilik.
// Yazım kuralları sablon.mjs ile aynı: e(x) = ad alanları (bilinen gizli değerler maskeli + kaçış), m(x) = serbest metin (tam
// maskeleme + kaçış). Sayfa JS'siz, dış kaynaksız.
import { kacis } from '../html-rapor.mjs';
import {
  aksiyonTablosu, durumEtiketi, fark, kart, oranKivilcimi, ortakMeta, puanEtiketi, renkOran, rozetHap, sinifDagilimiTablosu, sonHap, sorunTablosu, sure,
  sureDagilimi, sureGrafigi, sy, tarihSaat, tekBakista, trendGrafigi, yontemKutusu, yz
} from './bilesenler.mjs';
import { SERVIS_HATA_TURLERI } from '../sorun-modeli.mjs';

/** @typedef {(x: unknown) => string} Yazici */

const KAPSAM_ADI = /** @type {Record<string, string>} */ ({
  'coklu-ekran': 'Birden çok ekran', 'coklu-servis': 'Birden çok servis', karisik: 'Ekran + servis'
});
/** Seçilenler satırında adı yazılan en çok öğe. */
const EN_COK_AD = 10;

/**
 * @param {any} v rapor verisi (tur: coklu-ekran | coklu-servis | karisik)
 * @param {{ e: Yazici; m: Yazici }} y
 * @returns {{ baslik: string; alt: string; meta: Array<[string, string]>; govde: string }}
 */
export function cokluRapor(v, y) {
  const { e, m } = y;
  const c = v.coklu;
  const et = c.ekranTarafi;
  const st = c.servisTarafi;
  const karma = v.tur === 'karisik';
  const k = !v.karsilastir;
  const esik = v.esikler;
  let no = 0;
  const h2 = (/** @type {string} */ metin, ek = '') => `<h2 class="${ek}"><span class="no">${++no}</span>${kacis(metin)}</h2>`;
  const baslik = v.tur === 'coklu-ekran' ? `Ekranlar Raporu — ${v.oge.ad}` : v.tur === 'coklu-servis' ? `Servisler Raporu — ${v.oge.ad}` : 'Birleşik Rapor — Ekranlar ve Servisler';
  const alt = v.tur === 'coklu-ekran' ? 'Birden çok ekran: karşılaştırmalı durum, sağlık sıralaması, öncelikli aksiyonlar ve sorun eğilimleri'
    : v.tur === 'coklu-servis' ? 'Birden çok servis: servis ve metot karşılaştırması, yavaşlamalar, hata türleri, servis akışları'
      : 'Seçilen ekranlar ve servisler: iki tarafın ayrı özeti, birleşik öncelik listesi, bağlantılı sorunlar';

  // ---- Üst bilgi: seçilenler (adlar; çoksa ilk EN_COK_AD).
  const adlar = (/** @type {Array<{ ad: string }>} */ l, /** @type {boolean} */ tum, /** @type {string} */ tur) => {
    const ilk = l.slice(0, EN_COK_AD).map((x) => e(x.ad)).join(', ');
    return `${tum ? `Tüm ${tur} (${l.length})` : `${l.length} ${tur}`}: ${ilk}${l.length > EN_COK_AD ? ` ve ${l.length - EN_COK_AD} diğer` : ''}`;
  };
  const sec = v.secilenler;
  const secilenler = [
    sec.ekranlar.length ? adlar(sec.ekranlar, sec.tumEkranlar, sec.tumEkranlar ? 'ekranlar' : 'ekran') : '',
    sec.servisler.length ? adlar(sec.servisler, sec.tumServisler, sec.tumServisler ? 'servisler' : 'servis') : ''
  ].filter(Boolean).join('<br>');
  const meta = ortakMeta(v, e, m, KAPSAM_ADI[v.tur] ?? v.tur, secilenler);

  // ---- 1) Tek bakışta.
  const acikNot = `<span class="kotu fk">${v.durumSayim.yeni} yeni · ${v.durumSayim.artan} artan · ${v.durumSayim.tekrar} tekrar eden</span> <span class="iyi fk">${v.durumSayim.cozulen} çözülen</span>`;
  const basariKarti = (/** @type {string} */ etiket, /** @type {any} */ o, /** @type {string} */ ek = '') => kart(etiket, yz(o.basari),
    `${fark(o.basari, o.oncekiBasari, { birim: 'puan', b: 1, kapali: k })} ${k ? '' : `<span class="notr">önceki ${yz(o.oncekiBasari)}</span>`}${ek}`, renkOran(o.basari, esik));
  /** @type {string[]} */
  let kartlar;
  if (v.tur === 'coklu-ekran') {
    const o = et.ozet;
    kartlar = [
      basariKarti('Dönem başarı oranı', o),
      kart('Koşulan test', sy(o.test), `${fark(o.test, o.oncekiTest, { yon: 'notr', kapali: k })} <span class="notr">${o.ogeSayisi} ekran · ${o.senaryoSayisi} senaryo · ${o.tamKosu} tam koşu</span>`),
      kart('Başarısız sonuç', sy(o.basarisiz), `${fark(o.basarisiz, o.oncekiBasarisiz, { yon: 'asagi-iyi', kapali: k })}${k || o.oncekiBasarisiz === null ? '' : ` <span class="notr">önceki ${sy(o.oncekiBasarisiz)}</span>`}`, o.basarisiz ? 'kotu' : ''),
      kart('Açık sorun', sy(o.acikSorun), acikNot),
      kart('Hatasız ekran', `${sy(o.hatasizOge)} / ${sy(o.ogeSayisi)}`, `${fark(o.hatasizOge, o.oncekiHatasizOge, { kapali: k })} <span class="notr">dönemde hiç kalmayan</span>`),
      kart('Kararsız senaryo', sy(o.kararsizSenaryo), fark(o.kararsizSenaryo, o.oncekiKararsizSenaryo, { yon: 'asagi-iyi', kapali: k }))
    ];
  } else if (v.tur === 'coklu-servis') {
    const o = st.ozet;
    kartlar = [
      basariKarti('Başarı oranı', o),
      kart('Servis çağrısı', sy(o.cagri), `${fark(o.cagri, o.oncekiCagri, { yon: 'notr', kapali: k })} <span class="notr">${o.ogeSayisi} servis · ${o.metotSayisi} metot</span>`),
      kart('Başarısız + hata', sy(o.kalan), `${fark(o.kalan, o.oncekiKalan, { yon: 'asagi-iyi', kapali: k })}${k || o.oncekiKalan === null ? '' : ` <span class="notr">önceki ${sy(o.oncekiKalan)}</span>`}`, o.kalan ? 'kotu' : ''),
      kart('Yavaşlayan metot', sy(o.yavaslayan), o.enYavas ? `<span class="notr">en yavaş p95: ${e(o.enYavas.metot)} ${kacis(sure(o.enYavas.p95))}</span>` : '<span class="notr">ölçüm yok</span>', o.yavaslayan ? 'kotu' : ''),
      kart('Servis akışı başarısı', yz(o.akisBasari), `<span class="notr">${sy(o.akisKosu)} akış koşusu · ${c.akislar.length} akış</span>`, renkOran(o.akisBasari, esik)),
      kart('Açık sorun', sy(o.acikSorun), acikNot)
    ];
  } else {
    const oe = et.ozet;
    const os = st.ozet;
    kartlar = [
      basariKarti('Ekran başarısı', oe, ` <span class="notr">${oe.ogeSayisi} ekran · ${sy(oe.test)} test</span>`),
      basariKarti('Servis başarısı', os, ` <span class="notr">${os.ogeSayisi} servis · ${sy(os.cagri)} çağrı</span>`),
      kart('Açık sorun', sy(v.ozet.acikSorun), `<span class="notr">ekran ${oe.acikSorun} · servis ${os.acikSorun}</span> ${acikNot}`),
      kart('Bağlantılı sorun çifti', sy(c.baglantili.length), c.baglantili.length ? '<span class="kotu fk">ekran ↔ servis aynı günlerde</span>' : '<span class="notr">eşik üstü örtüşme yok</span>', c.baglantili.length ? 'kotu' : ''),
      kart('P1 aksiyon', sy(v.bantSayim.P1), '<span class="notr">bu hafta ele alınmalı</span>', v.bantSayim.P1 ? 'kotu' : ''),
      kart('Hatasız öğe', `${sy(oe.hatasizOge + os.hatasizOge)} / ${sy(oe.ogeSayisi + os.ogeSayisi)}`, '<span class="notr">dönemde hiç kalmayan ekran / servis</span>')
    ];
  }
  let govde = tekBakista({ no: ++no, rozet: v.rozet, kartlar, maddeler: v.maddeler, m });
  if (!v.kosuVar) govde += `<p class="not">Bu dönemde seçilen öğelerde koşu yok${v.ortam ? ` (ortam: ${e(v.ortam.ad)})` : ''}. Sayılar boştur; dönemi genişletin ya da koşuyu başlatın.</p>`;
  if (sec.eksik) govde += `<p class="not">Seçimdeki ${sec.eksik} öğe artık projede yok; rapor kalan öğelerle üretildi.</p>`;

  // ---- Karma: ekran ve servis tarafı ayrı özet.
  if (karma) {
    const satir = (/** @type {string} */ a, /** @type {string} */ b, /** @type {string} */ f = '') => `<tr><td>${kacis(a)}</td><td class="s">${b}</td>${k ? '' : `<td>${f}</td>`}</tr>`;
    const zayif = (/** @type {any[]} */ l) => { const x = l.find((o) => o.basari !== null); return x ? `${e(x.ad)} ${rozetHap(x.rozet.durum)}` : '—'; };
    const bas = `<thead><tr><th scope="col">Ölçü</th><th scope="col" class="s">Bu dönem</th>${k ? '' : '<th scope="col">Önceki döneme göre</th>'}</tr></thead>`;
    const oe = et.ozet;
    const os = st.ozet;
    govde += `${h2('Ekran ve servis tarafı')}<div class="iki"><div class="taraf"><h3>Ekran tarafı (${oe.ogeSayisi} ekran)</h3><table>${bas}<tbody>
${satir('Başarı oranı', `<b class="${renkOran(oe.basari, esik)}">${yz(oe.basari)}</b>`, fark(oe.basari, oe.oncekiBasari, { birim: 'puan', b: 1 }))}
${satir('Koşulan test (tam koşu)', sy(oe.test), fark(oe.test, oe.oncekiTest, { yon: 'notr' }))}
${satir('Başarısız sonuç', sy(oe.basarisiz), fark(oe.basarisiz, oe.oncekiBasarisiz, { yon: 'asagi-iyi' }))}
${satir('Açık sorun', sy(oe.acikSorun))}${satir('Hatasız ekran', `${oe.hatasizOge} / ${oe.ogeSayisi}`, fark(oe.hatasizOge, oe.oncekiHatasizOge))}
<tr><td>En çok ilgi isteyen</td><td colspan="${k ? 1 : 2}" class="kucuk">${zayif(et.ogeler)}</td></tr></tbody></table></div>
<div class="taraf"><h3>Servis tarafı (${os.ogeSayisi} servis)</h3><table>${bas}<tbody>
${satir('Başarı oranı', `<b class="${renkOran(os.basari, esik)}">${yz(os.basari)}</b>`, fark(os.basari, os.oncekiBasari, { birim: 'puan', b: 1 }))}
${satir('Servis çağrısı', sy(os.cagri), fark(os.cagri, os.oncekiCagri, { yon: 'notr' }))}
${satir('Başarısız + hata', sy(os.kalan), fark(os.kalan, os.oncekiKalan, { yon: 'asagi-iyi' }))}
${satir('Açık sorun', sy(os.acikSorun))}${satir('Yavaşlayan metot', sy(os.yavaslayan))}
<tr><td>En çok ilgi isteyen</td><td colspan="${k ? 1 : 2}" class="kucuk">${zayif(st.ogeler)}</td></tr></tbody></table></div></div>
<p class="kucuk">Ekran ve servis oranları birbirine eklenmez (birimleri farklı: ekran = test, servis = çağrı). Durum rozeti daha düşük oranlı tarafa göre verilir.</p>`;
  }

  // ---- Ele alınması gerekenler (birleşik öncelik listesi) ve sorunlar.
  govde += aksiyonTablosu({ no: ++no, aksiyonlar: v.aksiyonlar, bantSayim: v.bantSayim, e, m });
  if (karma) govde += baglantiliTablo(c.baglantili, h2, m);
  govde += sorunTablosu({ no: ++no, sorunlar: v.sorunlar, hatalar: v.secenekler.hatalar, karsilastir: v.karsilastir, kosuVar: v.kosuVar, m, turSutunu: karma });

  // ---- Eğilim.
  const kirilim = v.donem.kirilim === 'gunluk' ? 'Günlük' : 'Haftalık';
  govde += h2('Eğilim', karma ? 'sayfa-sonu' : '');
  if (et) {
    govde += trendGrafigi({ kovalar: et.egilim.kovalar, oncekiOrt: et.egilim.oncekiOrt, esikler: esik, karsilastir: v.karsilastir, adetEtiketi: 'Koşulan test (tam koşu)',
      baslik: `${karma ? 'Ekran testleri — ' : ''}${kirilim.toLocaleLowerCase('tr')} başarı ve koşulan test (${et.ozet.ogeSayisi} ekran)`.replace(/^./, (h) => h.toLocaleUpperCase('tr')) });
  }
  if (st) {
    govde += trendGrafigi({ kovalar: st.egilim.kovalar, oncekiOrt: st.egilim.oncekiOrt, esikler: esik, karsilastir: v.karsilastir, adetEtiketi: 'Servis çağrısı',
      baslik: `${karma ? 'Servis çağrıları — ' : ''}${kirilim.toLocaleLowerCase('tr')} başarı ve çağrı sayısı (${st.ozet.ogeSayisi} servis)`.replace(/^./, (h) => h.toLocaleUpperCase('tr')) });
    if (!karma && st.sureEgilimi.p95.some((/** @type {number | null} */ p) => p !== null)) {
      govde += sureGrafigi({ etiketler: v.donem.kovaEtiketleri, p50: st.sureEgilimi.p50, p95: st.sureEgilimi.p95, oncekiP95: k ? null : st.sureEgilimi.oncekiP95, baslik: 'Yanıt süresi (seçilen servislerin tüm metotları; p50 / p95)' });
    }
  }

  // ---- Kapsamdaki öğeler: sağlık sıralaması + karşılaştırma.
  govde += h2('Kapsamdaki öğeler — sağlık sıralaması');
  if (et) govde += `${karma ? '<h3>Ekranlar</h3>' : ''}${ekranKiyasTablosu(et.ogeler, { e, k, esik })}`;
  if (st) govde += `${karma ? '<h3>Servisler</h3>' : ''}${servisKiyasTablosu(st.ogeler, { e, k, esik })}`;
  govde += '<div class="lejant"><span>Sıra: önce durum (✗ Kritik → ◆ Dikkat → ✓ Sağlıklı; öğe başına dönem başarısı ve P1 aksiyonuyla), sonra düşük başarı, P1, kötüleşen sorun. Dönemde koşusu olmayan öğe sondadır.</span><span>Eğilim: kova başına başarı oranı, kesikli çizgi = yeşil eşik.</span></div>';

  // ---- Türe özgü bölümler.
  if (v.tur === 'coklu-ekran') {
    govde += `${h2('Hata sınıfı ve adımlar')}<div class="iki"><div class="blok"><h3>Hata sınıfı dağılımı</h3>${sinifDagilimiTablosu(c.sinifDagilimi, e)}</div>
<div class="blok"><h3>En çok hata veren adımlar</h3>${enCokAdimTablosu(c.enCokAdim, m)}</div></div>`;
    govde += `${h2('Kapsam')}${kapsamTablosu(et.ogeler, e)}`;
  } else {
    govde += h2(karma ? 'Servis metotları' : 'Metotlar', karma ? 'sayfa-sonu' : '');
    govde += metotTablosu(st.metotlar, { e, k, esik });
    if (!karma) {
      govde += `<h3>Yavaşlayan metotlar (p95 ≥ %20 artış)</h3>${st.yavaslayanlar.length ? `<table><thead><tr><th scope="col">Servis › metot</th><th scope="col" class="s">Önceki p95</th><th scope="col" class="s">Bu dönem p95</th><th scope="col" class="s">Değişim</th><th scope="col" class="s">Ölçüm</th></tr></thead><tbody>
${st.yavaslayanlar.map((/** @type {any} */ x) => `<tr><td><span class="kucuk">${e(x.servis)} ›</span> <span class="mono" style="color:#1c2430">${e(x.metot)}</span></td><td class="s">${kacis(sure(x.oncekiP95))}</td><td class="s kotu"><b>${kacis(sure(x.p95))}</b></td><td class="s kotu">${x.oncekiP95 ? `▲ %${sy(((x.p95 - x.oncekiP95) / x.oncekiP95) * 100)}` : '—'}</td><td class="s">${sy(x.n)}</td></tr>`).join('')}
</tbody></table>` : '<p class="bos">Yavaşlayan metot yok.</p>'}`;
      govde += `<h3>Süre dağılımı (p50 / p95 / p99)</h3>${sureDagilimi(st.metotlar.map((/** @type {any} */ x) => ({ ...x, ad: `${x.servis} › ${x.ad}` })), e)}`;
    }
    govde += h2(karma ? 'Hata türleri ve sınıflar' : 'Hata türleri ve sınıflar');
    govde += `<h3>Metot × hata türü</h3>${hataMatrisiTablosu(st.hataMatrisi, { e, k })}`;
    govde += `<h3>Hata sınıfı dağılımı</h3>${sinifDagilimiTablosu(c.sinifDagilimi, e, karma)}`;
    govde += `${h2(karma ? 'Bu öğeleri kullanan akışlar' : 'Servis akışları')}${akisTablosu(c.akislar, { e, k, esik })}`;
  }

  govde += yontemKutusu([
    ['Birleşik oranlar', 'Seçilen öğelerin sayıları toplanır, oran toplamdan hesaplanır (oranların ortalaması alınmaz). Önceki dönem de aynı biçimde toplanır.'],
    ['Sağlık sıralaması', 'Öğe başına durum rozeti (aynı eşikler ve P1 kuralı), sonra dönem başarısı, P1 aksiyon ve kötüleşen sorun sayısı. Rapor kapsamı dışındaki öğeler sıralamaya girmez.'],
    ...(karma ? [
      /** @type {[string, string]} */ (['Ekran + servis', 'Ekran ve servis oranları ayrı gösterilir, birbirine eklenmez (ekran = test, servis = çağrı); durum rozeti daha düşük oranlı tarafa göre verilir. Öncelik listesi iki tarafın sorunlarını birlikte sıralar.']),
      /** @type {[string, string]} */ (['Bağlantılı sorun', 'Bir ekran sorunu ile bir servis sorununun görüldüğü kovaların (günlük kırılımda gün) kesişimi ÷ birleşimi (Jaccard) ≥ 0,6 ve en az 2 ortak kova ise önerilir; iki sorun tek aksiyonda birleşir (puanı yüksek olan kalır). Öneri niteliğindedir.'])
    ] : []),
    ...(st ? [/** @type {[string, string]} */ (['Süre', 'Servis süresi = isteğin gönderilmesinden yanıtın tamamlanmasına kadar. p50 / p95 / p99: en yakın sıra yöntemi; “hata” (yanıt yok) süreye girmez; p99 yalnız 20+ ölçümde.'])] : []),
    ...(et ? [/** @type {[string, string]} */ (['Tekil koşular', 'Tek ▷ ve “Seçilenleri çalıştır” koşuları sorunlara girer, başarı oranına girmez.'])] : [])
  ]);
  return { baslik, alt, meta, govde };
}

/** Ekran karşılaştırma tablosu (sağlık sırasıyla; genel raporda ortak akışlar işaretli). @param {any[]} ogeler @param {{ e: Yazici; k: boolean; esik: { yesil: number; sari: number } }} y */
export function ekranKiyasTablosu(ogeler, y) {
  const { e, k, esik } = y;
  return `<table><thead><tr><th scope="col" class="c">Sıra</th><th scope="col">Ekran</th><th scope="col">Durum</th><th scope="col" class="s">Senaryo</th><th scope="col" class="s">Test</th><th scope="col" class="s">Başarı</th>${k ? '' : '<th scope="col" class="s">Önceki</th><th scope="col">Fark</th>'}<th scope="col">Eğilim</th><th scope="col" class="s">Açık sorun</th><th scope="col">Son koşu</th></tr></thead><tbody>
${ogeler.map((o) => `<tr><td class="c"><span class="sira">${o.sira}</span></td><td><b>${e(o.ad)}</b>${o.ortakAkis ? ' <span class="kucuk">(ortak akış)</span>' : ''}</td><td>${rozetHap(o.rozet.durum)}</td><td class="s">${o.senaryo}</td><td class="s">${sy(o.test)}</td><td class="s ${renkOran(o.basari, esik)}"><b>${yz(o.basari)}</b></td>${k ? '' : `<td class="s notr">${yz(o.oncekiBasari)}</td><td>${o.test ? fark(o.basari, o.oncekiBasari, { birim: 'puan', b: 1 }) : ''}</td>`}<td>${oranKivilcimi(o.oranSeri, esik)}</td><td class="s">${o.acikSorun}${o.kotulesen ? ` <span class="kucuk kotu">(${o.kotulesen} kötüleşen)</span>` : ''}${o.p1 ? `<br><span class="kucuk kotu">${o.p1} P1</span>` : ''}</td><td>${sonHap(o.son)}</td></tr>`).join('')}
</tbody></table>`;
}

/** Servis karşılaştırma tablosu (sağlık sırasıyla). @param {any[]} ogeler @param {{ e: Yazici; k: boolean; esik: { yesil: number; sari: number } }} y */
export function servisKiyasTablosu(ogeler, y) {
  const { e, k, esik } = y;
  return `<table><thead><tr><th scope="col" class="c">Sıra</th><th scope="col">Servis</th><th scope="col">Durum</th><th scope="col" class="s">Metot</th><th scope="col" class="s">Çağrı</th><th scope="col" class="s">Başarı</th>${k ? '' : '<th scope="col">Fark</th>'}<th scope="col" class="s">En yüksek p95</th>${k ? '' : '<th scope="col">p95 farkı</th>'}<th scope="col">Eğilim</th><th scope="col" class="s">Açık sorun</th><th scope="col">Son</th></tr></thead><tbody>
${ogeler.map((o) => `<tr><td class="c"><span class="sira">${o.sira}</span></td><td><b>${e(o.ad)}</b>${o.tur ? ` <span class="kucuk">(${kacis(String(o.tur).toUpperCase())})</span>` : ''}</td><td>${rozetHap(o.rozet.durum)}</td><td class="s">${o.metot}</td><td class="s">${sy(o.cagri)}</td><td class="s ${renkOran(o.basari, esik)}"><b>${yz(o.basari)}</b></td>${k ? '' : `<td>${o.cagri ? fark(o.basari, o.oncekiBasari, { birim: 'puan', b: 1 }) : ''}</td>`}<td class="s">${o.yavaslayan ? '<b class="kotu">' : ''}${kacis(sure(o.p95))}${o.yavaslayan ? '</b>' : ''}</td>${k ? '' : `<td>${o.cagri ? fark(o.p95, o.oncekiP95, { yon: 'asagi-iyi', birim: 'ms' }) : ''}</td>`}<td>${oranKivilcimi(o.oranSeri, esik)}</td><td class="s">${o.acikSorun}${o.kotulesen ? ` <span class="kucuk kotu">(${o.kotulesen} kötüleşen)</span>` : ''}${o.p1 ? `<br><span class="kucuk kotu">${o.p1} P1</span>` : ''}</td><td>${sonHap(o.son)}</td></tr>`).join('')}
</tbody></table>`;
}

/** @param {any[]} ogeler @param {Yazici} e */
function kapsamTablosu(ogeler, e) {
  return `<table><thead><tr><th scope="col">Ekran</th><th scope="col" class="s">Senaryo (koşuya dahil)</th><th scope="col" class="s">Dönemde koşmayan</th><th scope="col" class="s">Hep atlanan</th><th scope="col" class="s">Tam koşu</th><th scope="col">Model sürümü</th></tr></thead><tbody>
${ogeler.map((o) => `<tr><td>${e(o.ad)}</td><td class="s">${o.kapsam.senaryo} (${o.kapsam.kosuyaDahil})</td><td class="s ${o.kapsam.hicKosmayan ? 'kotu' : ''}">${o.kapsam.hicKosmayan}</td><td class="s ${o.kapsam.hepAtlanan ? 'kotu' : ''}">${o.kapsam.hepAtlanan}</td><td class="s">${o.tamKosu}</td><td class="kucuk">${o.kapsam.modelSurumu ? `v${o.kapsam.modelSurumu.surum} · ${kacis(tarihSaat(o.kapsam.modelSurumu.tarih).slice(0, 10))}` : '—'}</td></tr>`).join('')}
</tbody></table><p class="kucuk">Model alan kapsamı ve senaryosu olmayan alan grupları sonraki sürümde eklenecek.</p>`;
}

/** @param {any[]} liste @param {Yazici} m */
function enCokAdimTablosu(liste, m) {
  if (!liste.length) return '<p class="bos">Bu dönemde kalan test yok.</p>';
  return `<table><thead><tr><th scope="col">Ekran › adım</th><th scope="col" class="s">Adet</th><th scope="col">Durum</th></tr></thead><tbody>
${liste.map((s) => `<tr><td class="kucuk">${m(s.nerede)}</td><td class="s"><b>${sy(s.n)}</b></td><td>${durumEtiketi(s.durum)}</td></tr>`).join('')}</tbody></table>`;
}

/** @param {any[]} metotlar @param {{ e: Yazici; k: boolean; esik: { yesil: number; sari: number } }} y */
function metotTablosu(metotlar, y) {
  const { e, k, esik } = y;
  if (!metotlar.length) return '<p class="bos">Seçilen servislerin senaryosu yok.</p>';
  return `<table><thead><tr><th scope="col">Servis</th><th scope="col">Metot</th><th scope="col" class="s">Senaryo</th><th scope="col" class="s">Çağrı</th><th scope="col" class="s">Başarı</th>${k ? '' : '<th scope="col">Fark</th>'}<th scope="col" class="s">p50</th><th scope="col" class="s">p95</th>${k ? '' : '<th scope="col">p95 farkı</th>'}<th scope="col">Son</th></tr></thead><tbody>
${metotlar.map((t) => `<tr><td class="kucuk">${e(t.servis)}</td><td><span class="mono" style="font-size:8pt;color:#1c2430">${e(t.ad)}</span></td><td class="s">${t.senaryo}</td><td class="s">${sy(t.cagri)}</td><td class="s ${renkOran(t.basari, esik)}"><b>${yz(t.basari)}</b></td>${k ? '' : `<td>${t.cagri ? fark(t.basari, t.oncekiBasari, { birim: 'puan', b: 1 }) : ''}</td>`}<td class="s">${kacis(sure(t.p50))}</td><td class="s">${t.yavas ? '<b class="kotu">' : ''}${kacis(sure(t.p95))}${t.yavas ? '</b>' : ''}</td>${k ? '' : `<td>${t.cagri ? fark(t.p95, t.oncekiP95, { yon: 'asagi-iyi', birim: 'ms' }) : ''}${t.yavas ? ' <span class="kucuk kotu">yavaşladı</span>' : ''}</td>`}<td>${sonHap(t.son)}</td></tr>`).join('')}
</tbody></table><div class="lejant"><span>Başarı = başarılı ÷ (başarılı + başarısız + hata). “Yavaşladı”: p95 önceki döneme göre ≥ %20 arttı (≥ 20 ölçüm).</span></div>`;
}

/** @param {any[]} satirlar @param {{ e: Yazici; k: boolean }} y */
function hataMatrisiTablosu(satirlar, y) {
  const { e, k } = y;
  if (!satirlar.length) return '<p class="bos">Bu dönemde ve önceki dönemde hatalı çağrı yok.</p>';
  return `<table><thead><tr><th scope="col">Metot</th>${SERVIS_HATA_TURLERI.map(([, a]) => `<th scope="col" class="c">${kacis(a)}</th>`).join('')}<th scope="col" class="s">Toplam</th>${k ? '' : '<th scope="col" class="s">Önceki</th>'}</tr></thead><tbody>
${satirlar.map((r) => `<tr><td><span class="mono" style="color:#1c2430">${e(r.metot)}</span><br><span class="kucuk">${e(r.servis)}</span></td>${SERVIS_HATA_TURLERI.map(([t]) => { const n = r.sayilar[t] ?? 0; return n ? `<td class="c" style="background:${n >= 5 ? '#f7a8a3' : '#fde2e0'};font-weight:700">${n}</td>` : '<td class="c notr">·</td>'; }).join('')}<td class="s"><b>${r.toplam}</b></td>${k ? '' : `<td class="s notr">${r.onceki} ${fark(r.toplam, r.onceki, { yon: 'asagi-iyi' })}</td>`}</tr>`).join('')}
</tbody></table><div class="lejant"><span>“Kontrol kaldı” = yanıt geldi (2xx) ama senaryodaki bir kontrol tutmadı. Zaman aşımı / bağlantı: yanıt gelmedi.</span></div>`;
}

/**
 * Akış tablosu (servis / oturum / uçtan uca akışları). bos: akış yoksa yazılan metin.
 * @param {any[]} akislar @param {{ e: Yazici; k: boolean; esik: { yesil: number; sari: number }; bos?: string }} y
 */
export function akisTablosu(akislar, y) {
  const { e, k, esik } = y;
  if (!akislar.length) return `<p class="bos">${kacis(y.bos ?? 'Seçilen servisleri kullanan servis akışı yok.')}</p>`;
  return `<table><thead><tr><th scope="col">Akış</th><th scope="col">Tür</th><th scope="col" class="s">Koşu</th><th scope="col" class="s">Başarı</th>${k ? '' : '<th scope="col">Fark</th>'}<th scope="col" class="s">Ort. süre</th><th scope="col">Son</th></tr></thead><tbody>
${akislar.map((a) => `<tr><td><b>${e(a.ad)}</b><br><span class="kucuk">${a.adim} adım</span></td><td class="kucuk">${kacis(a.tur)}</td><td class="s">${a.kosu}</td><td class="s ${renkOran(a.basari, esik)}"><b>${yz(a.basari)}</b></td>${k ? '' : `<td>${a.kosu ? fark(a.basari, a.oncekiBasari, { birim: 'puan', b: 1 }) : ''}</td>`}<td class="s">${kacis(sure(a.ortSure))}</td><td>${sonHap(a.son)}</td></tr>`).join('')}
</tbody></table><p class="kucuk">Akışlar yalnız gösterilir; durum rozetini etkilemez (kritik akış işareti henüz yok).</p>`;
}

/**
 * Bağlantılı sorunlar (ekran ↔ servis).
 * @param {any[]} ciftler @param {(metin: string, ek?: string) => string} h2 @param {Yazici} m
 */
export function baglantiliTablo(ciftler, h2, m) {
  const bas = h2('Bağlantılı sorunlar (ekran ↔ servis)');
  if (!ciftler.length) return `${bas}<p class="bos">Eşik üstünde örtüşen ekran ve servis sorunu yok.</p>`;
  const hucre = (/** @type {any} */ s) => `<b>${m(s.baslik)}</b><br><span class="kucuk">${m(s.nerede)}</span><br>${durumEtiketi(s.durum)} ${puanEtiketi(s.bant, s.puan)}`;
  return `${bas}<table><thead><tr><th scope="col">Ekran sorunu</th><th scope="col">Servis sorunu</th><th scope="col" class="s">Örtüşme</th><th scope="col">Aksiyon</th></tr></thead><tbody>
${ciftler.map((c) => `<tr><td class="kucuk">${hucre(c.ekran)}</td><td class="kucuk">${hucre(c.servis)}</td><td class="s">${c.ortak} / ${c.birlesim} kova<br><span class="kucuk">%${sy(c.jaccard * 100)}</span></td><td class="kucuk">${c.birlesti ? 'Tek aksiyonda birleştirildi (puanı yüksek olan kaldı).' : 'Biri çözülmüş / zaten birleşmiş; ayrı izlenir.'}</td></tr>`).join('')}
</tbody></table><p class="kucuk">Örtüşme = iki sorunun görüldüğü kovaların kesişimi ÷ birleşimi (Jaccard); ≥ %60 ve en az 2 ortak kova ise “bağlantılı” sayılır. Aynı kök neden olasıdır (ör. ortam kesintisi); öneri niteliğindedir.</p>`;
}
