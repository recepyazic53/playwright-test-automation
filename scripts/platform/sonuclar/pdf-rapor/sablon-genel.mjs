// PDF RAPORU — genel raporun gövdesi (saf; A3): projenin tamamı (rapor verisi: donem-raporu.mjs > cokluBolumler + genelBolumler).
// İskelet tasarımdaki genel rapordur: Tek bakışta → Ele alınması gerekenler → (bağlantılı sorunlar, varsa) → Sorunlar ve
// eğilimleri (tür sütunlu) → Eğilim (ekran + servis ayrı) → Ekranlar ve ortak akışlar → Servisler → Servis akışları ve uçtan
// uca akışlar → Planlı koşular → Kararsız testler + Test verisi sağlığı → Kapsam ve açıklar → Ortamlara göre (birden çok
// ortam varsa) → Yöntem + gizlilik. Tablolar çoklu raporla aynı bileşenlerdir (sablon-coklu.mjs). A4 (rapor verileri; tanımlıysa):
// "Kritik akış" kartı, Eğilim'den sonra "Uygulama sürümlerine göre", Servisler'in sonunda "Süre eşiği aşımları".
// Yazım kuralları sablon.mjs ile aynı: e(x) = ad alanları (bilinen gizli değerler maskeli + kaçış), m(x) = serbest metin (tam
// maskeleme + kaçış). Sayfa JS'siz, dış kaynaksız.
import { kacis } from '../html-rapor.mjs';
import {
  aksiyonTablosu, esikTablosu, fark, kart, kritikKarti, ortakMeta, renkOran, sorunTablosu, sure, surumBolumu, sy, tekBakista, trendGrafigi, yontemKutusu, yz
} from './bilesenler.mjs';
import { akisTablosu, baglantiliTablo, ekranKiyasTablosu, servisKiyasTablosu } from './sablon-coklu.mjs';

/** @typedef {(x: unknown) => string} Yazici */

/**
 * @param {any} v rapor verisi (tur: genel)
 * @param {{ e: Yazici; m: Yazici }} y
 * @returns {{ baslik: string; alt: string; meta: Array<[string, string]>; govde: string }}
 */
export function genelRapor(v, y) {
  const { e, m } = y;
  const c = v.coklu;
  const gn = v.genel;
  const et = c.ekranTarafi;
  const st = c.servisTarafi;
  const k = !v.karsilastir;
  const esik = v.esikler;
  let no = 0;
  const h2 = (/** @type {string} */ metin, ek = '') => `<h2 class="${ek}"><span class="no">${++no}</span>${kacis(metin)}</h2>`;
  const baslik = 'Genel Rapor — Tüm Proje';
  const alt = 'Her şey dahil: ekranlar, ortak akışlar, servisler, akışlar, planlı koşular, test verisi sağlığı ve kapsam';
  const o = gn.ozet;
  const secilenler = kacis([
    `${o.ekranSayisi} ekran${o.ortakAkisSayisi ? ` + ${o.ortakAkisSayisi} ortak akış` : ''}`, `${o.servisSayisi} servis`,
    `${o.akisSayisi} servis akışı`, `${o.uctanUcaSayisi} uçtan uca akış`, `${o.kuralSayisi} planlı koşu kuralı`
  ].join(' · '));
  const meta = ortakMeta(v, e, m, 'Genel (her şey dahil)', secilenler);

  // ---- 1) Tek bakışta: ekran ve servis oranları ayrı; akışlar, açık sorun, planlı koşu güvenilirliği, test verisi sağlığı.
  const basariKarti = (/** @type {string} */ etiket, /** @type {any} */ x, /** @type {string} */ ek) => (x
    ? kart(etiket, yz(x.basari), `${fark(x.basari, x.oncekiBasari, { birim: 'puan', b: 1, kapali: k })} <span class="notr">${ek}</span>`, renkOran(x.basari, esik))
    : kart(etiket, '—', '<span class="notr">projede yok</span>'));
  const kotulesen = v.durumSayim.yeni + v.durumSayim.artan + v.durumSayim.tekrar;
  const z = gn.zamanlanmis;
  const tv = gn.testVerisi;
  const kartlar = [
    basariKarti('Ekran başarısı', et?.ozet, et ? `${sy(et.ozet.test)} test` : ''),
    basariKarti('Servis başarısı', st?.ozet, st ? `${sy(st.ozet.cagri)} çağrı` : ''),
    kart('Akışlar (servis + uçtan uca)', yz(gn.akis.basari), `${gn.akis.kosu ? fark(gn.akis.basari, gn.akis.oncekiBasari, { birim: 'puan', b: 1, kapali: k }) : ''} <span class="notr">${sy(gn.akis.kosu)} koşu · ${gn.akis.sayi} akış</span>`, renkOran(gn.akis.basari, esik)),
    kart('Açık sorun', sy(v.ozet.acikSorun), `<span class="kotu fk">${kotulesen} kötüleşen</span> <span class="iyi fk">${v.durumSayim.cozulen} çözülen</span>`),
    kart('Planlı koşu güvenilirliği', yz(z.guvenilirlik), z.kurallar.length
      ? `${fark(z.guvenilirlik, z.oncekiGuvenilirlik, { birim: 'puan', b: 1, kapali: k })} <span class="notr">${z.atlandi} atlandı · ${z.yarida} yarıda${z.kisitli ? ' · kısıtlı geçmiş' : ''}</span>`
      : '<span class="notr">planlı koşu kuralı yok</span>', renkOran(z.guvenilirlik, esik)),
    kart('Test verisi sağlığı', tv.hesaplandi ? `${sy(tv.bulgu)} bulgu` : '—', tv.hesaplandi
      ? `<span class="${tv.kirik ? 'kotu' : 'notr'} fk">${tv.kirik} kırık başvuru</span> <span class="notr">${tv.kaynakliSonuc} test verisi kaynaklı sonuç</span>`
      : '<span class="notr">hesaplanamadı</span>', tv.kirik ? 'orta' : '')
  ];
  // A4: kritik işaretli öğe / akış varsa "Kritik akış" kartı.
  if (v.kritik) kartlar.push(kritikKarti(v.kritik, e));
  let govde = tekBakista({ no: ++no, rozet: v.rozet, kartlar, maddeler: v.maddeler, m });
  if (!v.kosuVar) govde += `<p class="not">Bu dönemde projede ekran ya da servis koşusu yok${v.ortam ? ` (ortam: ${e(v.ortam.ad)})` : ''}. Sayılar boştur; dönemi genişletin ya da koşuyu başlatın.</p>`;

  // ---- Ele alınması gerekenler, (varsa) bağlantılı sorunlar, sorunlar.
  govde += aksiyonTablosu({ no: ++no, aksiyonlar: v.aksiyonlar, bantSayim: v.bantSayim, e, m });
  if (c.baglantili.length) govde += baglantiliTablo(c.baglantili, h2, m);
  govde += sorunTablosu({ no: ++no, sorunlar: v.sorunlar, hatalar: v.secenekler.hatalar, karsilastir: v.karsilastir, kosuVar: v.kosuVar, m, turSutunu: true });

  // ---- Eğilim (ekran ve servis ayrı; birimleri farklı).
  const kirilim = v.donem.kirilim === 'gunluk' ? 'günlük' : 'haftalık';
  govde += h2('Eğilim', 'sayfa-sonu');
  if (et) {
    govde += trendGrafigi({ kovalar: et.egilim.kovalar, oncekiOrt: et.egilim.oncekiOrt, esikler: esik, karsilastir: v.karsilastir, adetEtiketi: 'Koşulan test (tam koşu)',
      baslik: `Ekran testleri — ${kirilim} başarı (tüm ekranlar ve ortak akışlar)` });
  }
  if (st) {
    govde += trendGrafigi({ kovalar: st.egilim.kovalar, oncekiOrt: st.egilim.oncekiOrt, esikler: esik, karsilastir: v.karsilastir, adetEtiketi: 'Servis çağrısı',
      baslik: `Servis çağrıları — ${kirilim} başarı (tüm servisler)` });
  }

  // ---- A4: uygulama sürümüne göre başarı (koşular sürüm etiketliyse).
  govde += surumBolumu(v.surumler, { e, esik, h2 });

  // ---- Ekranlar ve ortak akışlar · Servisler.
  govde += h2('Ekranlar ve ortak akışlar');
  govde += et ? ekranKiyasTablosu(et.ogeler, { e, k, esik }) : '<p class="bos">Projede ekran yok.</p>';
  govde += h2('Servisler');
  if (st) {
    govde += servisKiyasTablosu(st.ogeler, { e, k, esik });
    const yavas = st.yavaslayanlar;
    govde += `<p class="kucuk">${yavas.length
      ? `Yavaşlayan metotlar (p95 ≥ %20 artış): ${yavas.slice(0, 5).map((/** @type {any} */ x) => `${e(x.servis)} › ${e(x.metot)} (${kacis(sure(x.oncekiP95))} → ${kacis(sure(x.p95))})`).join(', ')}${yavas.length > 5 ? ` ve ${yavas.length - 5} diğer` : ''}.`
      : 'Yavaşlayan metot yok.'}${st.ozet.enYavas ? ` En yüksek p95: ${e(st.ozet.enYavas.metot)} ${kacis(sure(st.ozet.enYavas.p95))}.` : ''} Metot ayrıntısı: servis raporu.</p>`;
    govde += '<div class="lejant"><span>Sıra: önce durum (✗ Kritik → ◆ Dikkat → ✓ Sağlıklı), sonra düşük başarı, P1, kötüleşen sorun. Dönemde koşusu olmayan öğe sondadır.</span></div>';
  } else govde += '<p class="bos">Projede servis yok.</p>';
  // A4: ekran / servis / metot süre eşiği aşımları (yavaşlayanların yanında).
  govde += esikTablosu(v.esikAsimlari, { e, k });

  // ---- Akışlar.
  govde += `${h2('Servis akışları ve uçtan uca akışlar')}${akisTablosu(c.akislar, { e, k, esik, bos: 'Projede servis akışı ya da uçtan uca akış yok.' })}`;

  // ---- Planlı koşular.
  govde += h2('Planlı koşular');
  govde += zamanlanmisTablo(gn.zamanlanmis, { e, k, esik });

  // ---- Kararsız testler + test verisi sağlığı.
  govde += `<div class="iki"><div class="blok">${h2('Kararsız testler')}${kararsizTablo(gn.kararsiz, e)}</div>
<div class="blok">${h2('Test verisi sağlığı')}${testVerisiTablo(tv, { e, m, k })}</div></div>`;

  // ---- Kapsam ve açıklar.
  govde += `${h2('Kapsam ve açıklar')}${kapsamBolumu(gn.kapsam, e)}`;

  // ---- Ortamlara göre (yalnız "Tüm ortamlar" ve birden çok ortam).
  if (gn.ortamlar) govde += `${h2('Ortamlara göre')}${ortamTablosu(gn.ortamlar, { e, esik })}`;

  govde += yontemKutusu([
    ['Genel rapor', 'Rapor her üretildiğinde (yeniden oluşturmada da) o anki tüm ekranları, ortak akışları, servisleri, servis akışlarını, uçtan uca akışları ve planlı koşu kurallarını kapsar. Ekran ve servis oranları ayrı gösterilir, birbirine eklenmez; durum rozeti daha düşük oranlı tarafa göre verilir. “Akışlar” kartı servis, oturum ve uçtan uca akış koşularından.'],
    ['Planlı koşu güvenilirliği', 'Tamamlanan tetikleme ÷ takvime göre beklenen tetikleme (sonucun başarısından bağımsız). Beklenen = kuralın takviminden dönem içinde üretilen zamanlar (kural kaydından önceki zamanlar ve devre dışı kurallar hariç). Tamamlanan = “tamamlandı” ya da “başarısız sonuçlu”. Tetikleme geçmişi kural başına son 20 kayıtla sınırlıdır; dönem bu kayıtlardan eskiye uzanıyorsa hesap en eski kayıttan başlar (“kısıtlı”).'],
    ['Kararsız testler', 'Kararsızlık = geçti↔başarısız değişimi ÷ (koşu − 1); aynı senaryo, aynı ortam, aynı model sürümü ve aynı uygulama sürümündeki (sürüm kayıtlı değilse aynı gündeki) koşular. ≥ %20 ve ≥ 5 koşu: kararsız; %5–20 ya da tekrar denemesinde geçen: izlenir.'],
    ['Test verisi sağlığı', 'Test verisi ekranındaki “Veri sağlığı” ile aynı denetimler (kırık başvuru, hiç kullanılmayan tablo, birleştirilebilecek benzer tablo, boş sütun); değer içermez, yalnız tablo / sütun adları. “Test verisi kaynaklı sonuç” = sınıfı test verisi tahmin edilen sorunların başarısız sonuçları.'],
    ['Kritik akış, sürüm, ekip, eşik', 'Kritik akış işareti, ekip eşlemesi ve süre eşikleri Ayarlar > Raporlar\'da; uygulama sürümü ortam ayarında ya da koşu başlatılırken girilir ve koşu kaydına yazılır. Tanımlı olanlar raporda kullanılır (kritik akış kartı ve rozet kuralı, sahip önerisi, eşik aşımları, sürüme göre başarı); tanımlı olmayanlarda önceki davranış sürer (ayrıntı: “Rapor verileri”).'],
    ['Sonraki aşama', 'Kalıcı tetikleme kaydı (planlı koşu güvenilirliği 20 kayıtla sınırlı kalır), “iki uygulama sürümü arası” karşılaştırma, sorun kararları (bilinen / birleştir / bağlı değil) ve model alan kapsamı henüz yok.'],
    ['Tekil koşular', 'Tek ▷ ve “Seçilenleri çalıştır” koşuları sorunlara girer, başarı oranına girmez.']
  ], v.raporVerileri);
  return { baslik, alt, meta, govde };
}

/**
 * @param {any} z genel.zamanlanmis @param {{ e: Yazici; k: boolean; esik: { yesil: number; sari: number } }} y
 */
function zamanlanmisTablo(z, y) {
  const { e, k, esik } = y;
  if (!z.kurallar.length) return '<p class="bos">Projede planlı koşu kuralı yok (üst menü > Planlı koşular).</p>';
  const sayi = (/** @type {number | null} */ n, kotu = false) => (n === null ? '—' : kotu && n ? `<b class="kotu">${sy(n)}</b>` : sy(n));
  return `<table><thead><tr><th scope="col">Kural</th><th scope="col">Takvim</th><th scope="col" class="s">Beklenen</th><th scope="col" class="s">Tamamlandı</th><th scope="col" class="s">Başarısız sonuçlu</th><th scope="col" class="s">Atlandı</th><th scope="col" class="s">Yarıda / hata</th><th scope="col" class="s">Kaçan</th><th scope="col" class="s">Güvenilirlik</th>${k ? '' : '<th scope="col">Önceki döneme göre</th>'}</tr></thead><tbody>
${z.kurallar.map((/** @type {any} */ r) => `<tr><td><b>${e(r.ad)}</b><br><span class="kucuk">${kacis(r.kapsam || '—')}${r.ortam ? ` · ${e(r.ortam)}` : ''}${r.riskli ? ' <span class="kotu">◆ riskli</span>' : ''}${r.etkin ? '' : ' · devre dışı'}${r.kisitli ? ' · kısıtlı geçmiş' : ''}</span></td><td class="kucuk">${kacis(r.zaman)}</td><td class="s">${sayi(r.beklenen)}</td><td class="s">${sy(r.tamamlandi)}</td><td class="s">${sy(r.basarisizSonuclu)}</td><td class="s">${sayi(r.atlandi, true)}</td><td class="s">${sayi(r.yarida + r.hata, true)}</td><td class="s">${sayi(r.kacan, true)}</td><td class="s ${renkOran(r.guvenilirlik, esik)}"><b>${yz(r.guvenilirlik)}</b></td>${k ? '' : `<td>${r.guvenilirlik === null ? '' : fark(r.guvenilirlik, r.oncekiGuvenilirlik, { birim: 'puan', b: 1 })}</td>`}</tr>`).join('')}
<tr class="grup"><td>Toplam</td><td></td><td class="s">${sy(z.beklenen)}</td><td class="s">${sy(z.tamamlandi)}</td><td></td><td class="s">${sy(z.atlandi)}</td><td class="s">${sy(z.yarida)}</td><td></td><td class="s">${yz(z.guvenilirlik)}</td>${k ? '' : `<td>${fark(z.guvenilirlik, z.oncekiGuvenilirlik, { birim: 'puan', b: 1 })}</td>`}</tr></tbody></table>
<p class="kucuk">Güvenilirlik = tamamlanan tetikleme ÷ takvime göre beklenen tetikleme (sonucun başarısından bağımsız). “Başarısız sonuçlu” = koşu tamamlandı ama en az bir test başarısız oldu. “Kaçan” = beklenip hiç kaydı olmayan zaman (sunucu kapalı ya da kasa kilitli). Geçmiş kural başına son 20 tetiklemedir${z.kisitli ? '; “kısıtlı geçmiş” işaretli kurallarda hesap en eski kayıttan başlar' : ''}.</p>`;
}

/** @param {any} kr genel.kararsiz @param {Yazici} e */
function kararsizTablo(kr, e) {
  if (!kr.liste.length) return '<p class="bos">Bu dönemde kararsız ya da izlenen senaryo yok.</p>';
  return `<table><thead><tr><th scope="col">Senaryo</th><th scope="col" class="s">Koşu</th><th scope="col" class="s">Geçiş değişimi</th><th scope="col" class="s">Kararsızlık</th></tr></thead><tbody>
${kr.liste.map((/** @type {any} */ x) => `<tr><td class="kucuk"><b>${e(x.ad)}</b><br>${e(x.oge)}${x.durum === 'kararsiz' ? ' · <span class="kotu">≈ kararsız</span>' : ' · izlenir'}</td><td class="s">${sy(x.kosu)}</td><td class="s">${sy(x.degisim)}</td><td class="s ${x.durum === 'kararsiz' ? 'kotu' : 'orta'}">%${sy(x.oran * 100)}</td></tr>`).join('')}
</tbody></table><p class="kucuk">${kr.kararsiz} kararsız · ${kr.izlenir} izlenen senaryo. Kararsızlık = geçti↔başarısız değişimi ÷ (koşu − 1).</p>`;
}

/** @param {any} tv genel.testVerisi @param {{ e: Yazici; m: Yazici; k: boolean }} y */
function testVerisiTablo(tv, y) {
  const { e, m, k } = y;
  if (!tv.hesaplandi) return '<p class="bos">Veri sağlığı hesaplanamadı (test verisi okunamadı).</p>';
  const satir = (/** @type {string} */ a, /** @type {number} */ n, /** @type {string} */ f = '') => `<tr><td>${kacis(a)}</td><td class="s ${n ? 'kotu' : ''}"><b>${sy(n)}</b></td><td>${f}</td></tr>`;
  return `<table><thead><tr><th scope="col">Bulgu</th><th scope="col" class="s">Adet</th><th scope="col">${k ? '' : 'Önceki'}</th></tr></thead><tbody>
${satir('Kırık başvuru (silinmiş tablo / sütun)', tv.kirik)}${satir('Hiç kullanılmayan tablo', tv.kullanilmayan)}${satir('Birleştirilebilecek benzer tablo', tv.benzer)}${satir('Tamamen boş sütun', tv.bosSutun)}
${satir('Test verisi kaynaklı başarısız sonuç', tv.kaynakliSonuc, k ? '' : fark(tv.kaynakliSonuc, tv.oncekiKaynakliSonuc, { yon: 'asagi-iyi' }))}</tbody></table>
${tv.kirikOrnekler.length ? `<p class="kucuk">Kırık başvurular: ${tv.kirikOrnekler.map((/** @type {any} */ x) => `${e(x.yer)} → ${e(x.basvuru)} (${m(x.neden)})`).join('; ')}${tv.kirik > tv.kirikOrnekler.length ? ` ve ${tv.kirik - tv.kirikOrnekler.length} diğer` : ''}. Değer içermez; yalnız tablo / sütun adları.</p>` : '<p class="kucuk">Değer içermez; yalnız tablo / sütun adları. Önceki dönem yalnız sonuç sayısında karşılaştırılır (veri sağlığı anlık denetimdir).</p>'}`;
}

/** @param {any} kp genel.kapsam @param {Yazici} e */
function kapsamBolumu(kp, e) {
  const oran = (/** @type {number} */ a, /** @type {number} */ b) => (b ? `${sy(a)} / ${sy(b)} <span class="kucuk">(${yz((a / b) * 100)})</span>` : '—');
  const sol = `<table><thead><tr><th scope="col">Kapsam</th><th scope="col" class="s">Değer</th></tr></thead><tbody>
<tr><td>Dönemde koşan senaryo (toplu koşuya dahil)</td><td class="s">${oran(kp.donemdeKosan, kp.kosuyaDahil)}</td></tr>
<tr><td>Her koşuda atlanan senaryo</td><td class="s ${kp.hepAtlanan ? 'kotu' : ''}">${sy(kp.hepAtlanan)}</td></tr>
<tr><td>Senaryosu olan servis metodu${kp.metot ? ` <span class="kucuk">(${kp.metot.servis} servis)</span>` : ''}</td><td class="s">${kp.metot ? oran(kp.metot.senaryolu, kp.metot.toplam) : '—'}</td></tr>
<tr><td>Planlı koşu kuralına bağlı ekran</td><td class="s">${oran(kp.kuralliEkran, kp.kosulanEkran)}</td></tr>
<tr><td>Planlı koşu kuralına bağlı akış</td><td class="s">${oran(kp.kuralliAkis, kp.akis)}</td></tr></tbody></table>
${kp.olculmeyenServis ? `<p class="kucuk">${kp.olculmeyenServis} serviste operasyon listesi (sözleşme) olmadığından metot kapsamı ölçülmedi.</p>` : ''}`;
  const sag = kp.aciklar.length ? `<table><thead><tr><th scope="col">Açık</th><th scope="col">Öneri</th></tr></thead><tbody>
${kp.aciklar.map((/** @type {any} */ a) => `<tr><td class="kucuk"><b>${kacis(a.tur)}:</b> ${e(a.yer)}</td><td class="kucuk">${kacis(a.oneri)}</td></tr>`).join('')}</tbody></table>${kp.acikSayisi > kp.aciklar.length ? `<p class="kucuk">ve ${kp.acikSayisi - kp.aciklar.length} diğer açık.</p>` : ''}`
    : '<p class="bos">Açık bulunmadı.</p>';
  return `<div class="iki"><div>${sol}</div><div>${sag}</div></div>`;
}

/** @param {any[]} ortamlar @param {{ e: Yazici; esik: { yesil: number; sari: number } }} y */
function ortamTablosu(ortamlar, y) {
  const { e, esik } = y;
  return `<table><thead><tr><th scope="col">Ortam</th><th scope="col" class="s">Ekran testi</th><th scope="col" class="s">Ekran başarısı</th><th scope="col" class="s">Servis çağrısı</th><th scope="col" class="s">Servis başarısı</th></tr></thead><tbody>
${ortamlar.map((o) => `<tr><td><b>${e(o.ad)}</b>${o.riskli ? ' <span class="kucuk kotu">◆ canlı / riskli</span>' : ''}</td><td class="s">${sy(o.test)}</td><td class="s ${renkOran(o.ekranBasari, esik)}">${yz(o.ekranBasari)}</td><td class="s">${sy(o.cagri)}</td><td class="s ${renkOran(o.servisBasari, esik)}">${yz(o.servisBasari)}</td></tr>`).join('')}
</tbody></table><p class="kucuk">Ortam başına oranlar ayrı hesaplanır. Rapordaki toplamlar “Tüm ortamlar” seçildiği için bütün ortamları içerir; tek ortamın raporu için ortamı seçin.</p>`;
}
