// KOŞU GRUPLARI (Testlerim ve Senaryolar'da "Koşu grupları"): farklı ekranlardan seçilen senaryolara ad verip kaydedersiniz
// (ör. "Regresyon testi"); kayıtlı grup "Çalıştır" ile bugünkü toplu koşu onay penceresiyle koşar.
//   · Koşu oluştur: ekran bazında gruplanmış senaryo listesi + onay kutuları + grup adı → Kaydet (sunucu: senaryolar/kosu-gruplari.mjs;
//     kasada şifreli). Aynı pencere Düzenle için de kullanılır.
//   · Çalıştır: ortam seçilir; "Toplu koşuya dahil" kapalı, ekranı devre dışı ya da hazırlığı eksik senaryolar koşmaz ve pencerede
//     nedenleriyle yazılır (kosu-paneli.js > kosuOnayi). CANLI ortamda bugünkü onay sorulur. Kısmi koşu olarak kaydedilir.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, bosDurum, h, ikon, yeniKimlik } from './ortak.js';
import { ekranKosuBicimi, kosuBaslat, kosuDurumu, kosuOnayi, kosuOrtamiId, kosuSuruyorMu, onayIste } from './kosu-paneli.js';
import { sqlKosuDenetimiAl, sqlKosuUyarilari } from './sql-adimi-formu.js';
import { aramaEslesiyorMu } from './model-formu.mjs';

const hataMetni = (e) => (e && e.message ? e.message : String(e));
const birlesikListe = (projeId) => api(`/platform/senaryolar?projeId=${encodeURIComponent(projeId)}`);
const ortamKaydi = (x, ortamId) => (x.ortamlar || []).find((o) => o.ortamId === ortamId);

/** Gruba seçilebilen senaryolar, ekran bazında (ekran adına göre; silinen ekranlar ve senaryosuz ekranlar yok). */
function ekranGruplari(veri) {
  const ekranlar = (veri.ekranlar || []).filter((e) => e.durum !== 'silindi');
  return ekranlar.map((e) => ({ ekran: e, senaryolar: (veri.senaryolar || []).filter((s) => s.ekranId === e.id) }))
    .filter((g) => g.senaryolar.length).sort((a, b) => String(a.ekran.ad).localeCompare(String(b.ekran.ad), 'tr'));
}

/**
 * KOŞU OLUŞTUR / DÜZENLE penceresi. grup verilirse düzenleme. Kaydedilirse kayıtlı grubu, vazgeçilirse null verir.
 * @param {{ proje: { id: string; ad: string }; grup?: { id: string; ad: string; senaryoIdleri: string[] } | null }} s
 * @returns {Promise<{ id: string; ad: string } | null>}
 */
export async function kosuGrubuPenceresi(s) {
  const { proje, grup } = s;
  const kimlik = yeniKimlik('kosu-grubu');
  let veri;
  try { veri = await birlesikListe(proje.id); } catch (e) { if (!(e && e.durum === 423)) bildir(hataMetni(e), 'hata'); return null; }
  const gruplar = ekranGruplari(veri);
  const secili = new Set(grup ? grup.senaryoIdleri : []);
  const ad = h('input', { type: 'text', id: `${kimlik}-ad`, maxlength: '80', autocomplete: 'off', placeholder: 'Ör. Regresyon testi', value: grup ? grup.ad : '', required: true });
  const arama = h('input', { type: 'search', id: `${kimlik}-ara`, placeholder: 'Senaryo ya da ekran ara', autocomplete: 'off', 'aria-label': 'Senaryo ara' });
  const sayac = h('p', { class: 'soluk kucuk kosu-grubu-sayaci', role: 'status' });
  const hata = h('p', { class: 'alan-hatasi', role: 'alert' });
  const kaydet = h('button', { type: 'button', class: 'birincil' }, grup ? 'Kaydet' : 'Grubu kaydet');
  const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
  /** @type {Array<{ ekran: any; kutu: HTMLInputElement; satirlar: Array<{ s: any; kutu: HTMLInputElement; el: HTMLElement }>; el: HTMLElement; sayi: HTMLElement }>} */
  const bolumler = [];
  for (const g of gruplar) {
    const hepsi = h('input', { type: 'checkbox', 'aria-label': `${g.ekran.ad}: tüm senaryoları seç` });
    const sayi = h('span', { class: 'soluk kucuk' });
    const satirlar = g.senaryolar.map((sn) => {
      const kutu = h('input', { type: 'checkbox', id: yeniKimlik('kosu-grubu-senaryo'), checked: secili.has(sn.id) });
      kutu.addEventListener('change', () => { if (kutu.checked) secili.add(sn.id); else secili.delete(sn.id); guncelle(); });
      return { s: sn, kutu, el: h('li', {}, h('label', { class: 'onay-satiri', for: kutu.id }, kutu, h('span', {}, sn.baslik))) };
    });
    hepsi.addEventListener('change', () => {
      for (const x of satirlar.filter((y) => !y.el.hidden)) { x.kutu.checked = hepsi.checked; if (hepsi.checked) secili.add(x.s.id); else secili.delete(x.s.id); }
      guncelle();
    });
    const el = h('fieldset', { class: 'kosu-grubu-ekrani' },
      h('legend', {}, h('label', { class: 'onay-satiri' }, hepsi, h('b', {}, g.ekran.ad), sayi)),
      h('ul', { class: 'kosu-grubu-senaryolari' }, satirlar.map((x) => x.el)));
    bolumler.push({ ekran: g.ekran, kutu: hepsi, satirlar, el, sayi });
  }
  const liste = h('div', { class: 'kosu-grubu-listesi' }, bolumler.length ? bolumler.map((b) => b.el)
    : bosDurum('Henüz senaryo yok.', 'Önce bir test oluşturun; sonra farklı testlerden seçip grup yapabilirsiniz.', { ikon: 'liste' }));
  function guncelle() {
    const q = arama.value.trim();
    for (const b of bolumler) {
      let gorunen = 0;
      let isaretli = 0;
      for (const x of b.satirlar) {
        const eslesir = !q || aramaEslesiyorMu(x.s.baslik, q) || aramaEslesiyorMu(b.ekran.ad, q);
        x.el.hidden = !eslesir;
        if (eslesir) gorunen++;
        if (x.kutu.checked) isaretli++;
      }
      b.el.hidden = gorunen === 0;
      const gorunenIsaretli = b.satirlar.filter((x) => !x.el.hidden && x.kutu.checked).length;
      b.kutu.checked = gorunen > 0 && gorunenIsaretli === gorunen;
      b.kutu.indeterminate = gorunenIsaretli > 0 && gorunenIsaretli < gorunen;
      b.sayi.textContent = `${isaretli}/${b.satirlar.length} seçili`;
    }
    const ekranSayisi = bolumler.filter((b) => b.satirlar.some((x) => x.kutu.checked)).length;
    sayac.textContent = secili.size ? `${secili.size} senaryo seçili (${ekranSayisi} ekran).` : 'Henüz senaryo seçilmedi.';
  }
  arama.addEventListener('input', guncelle);
  const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay kosu-grubu-penceresi', 'aria-labelledby': `${kimlik}-baslik` },
    h('div', { class: 'diyalog-govde' },
      h('h2', { id: `${kimlik}-baslik` }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('liste')), grup ? 'Koşu grubunu düzenle' : 'Koşu oluştur'),
      h('p', { class: 'soluk' }, 'Farklı ekranlardan istediğiniz senaryoları seçin, gruba bir ad verin. Grubu sonra tek tıkla çalıştırırsınız.'),
      h('div', { class: 'alan' }, h('label', { for: ad.id, class: 'alan-etiketi' }, 'Grup adı'), ad),
      h('div', { class: 'alan' }, h('label', { for: arama.id, class: 'alan-etiketi' }, 'Senaryolar'), arama),
      sayac, liste, hata),
    h('div', { class: 'diyalog-alt' }, vazgec, kaydet));
  guncelle();
  return new Promise((coz) => {
    let sonuc = null;
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    kaydet.addEventListener('click', async () => {
      hata.textContent = '';
      if (!ad.value.trim()) { hata.textContent = 'Grup adını yazın.'; ad.focus(); return; }
      if (!secili.size) { hata.textContent = 'En az bir senaryo seçin.'; return; }
      kaydet.disabled = true;
      try {
        const y = await api('/platform/kosu-gruplari/kaydet', { govde: { projeId: proje.id, ...(grup ? { id: grup.id } : {}), ad: ad.value, senaryoIdleri: [...secili] } });
        sonuc = y.grup;
        bildir(grup ? `"${y.grup.ad}" grubu kaydedildi.` : `"${y.grup.ad}" koşu grubu oluşturuldu.`);
        diyalog.close();
      } catch (e) {
        if (!(e && e.durum === 423)) hata.textContent = hataMetni(e);
        kaydet.disabled = false;
      }
    });
    document.body.append(diyalog);
    diyalog.showModal();
    ad.focus();
  });
}

/**
 * Kayıtlı grubu çalıştırır: ortam seçimli toplu koşu onayı (kosuOnayi) → kosuBaslat. ortamId: önerilen ortam.
 * @param {{ proje: { id: string; ad: string }; ortamlar: any[]; ortamId?: string; grup: { id: string; ad: string; senaryoIdleri: string[] } }} s
 */
export async function kosuGrubunuCalistir(s) {
  const { proje, ortamlar, grup } = s;
  let veri;
  try { veri = await birlesikListe(proje.id); } catch (e) { if (!(e && e.durum === 423)) bildir(hataMetni(e), 'hata'); return; }
  const idler = new Set(grup.senaryoIdleri);
  const uyeler = (veri.senaryolar || []).filter((x) => idler.has(x.id));
  if (!uyeler.length) { bildir('Bu grubun senaryoları artık yok.', 'hata'); return; }
  const denetim = await sqlKosuDenetimiAl(proje.id);
  const y = await kosuOnayi({
    baslik: `"${grup.ad}" grubunu çalıştır?`, ortamlar, ortam: kosuSuruyorMu() && kosuOrtamiId() ? { id: kosuOrtamiId() } : (s.ortamId ? { id: s.ortamId } : undefined),
    hazirlik: { projeId: proje.id }, tur: 'tekil', esZamanli: false, ...(await ekranKosuBicimi()), veriKosusu: { projeId: proje.id }, surumAlani: true,
    hesapla: (o) => {
      const tanimli = uyeler.filter((x) => ortamKaydi(x, o.id)?.tanimli);
      const aday = tanimli.filter((x) => ortamKaydi(x, o.id)?.kosuyaDahil && x.ekranEtkin !== false && !kosuDurumu(x.id));
      const hazirligi = (x) => ortamKaydi(x, o.id)?.hazirlik;
      const kosacak = aday.filter((x) => hazirligi(x)?.calistirilabilir !== false);
      return {
        senaryolar: kosacak,
        calistirilamazlar: aday.filter((x) => hazirligi(x)?.calistirilabilir === false).map((x) => ({ id: x.id, baslik: x.baslik, neden: hazirligi(x)?.neden || '', eksikler: hazirligi(x)?.eksikler || [] })),
        haricSayisi: tanimli.filter((x) => !ortamKaydi(x, o.id)?.kosuyaDahil || x.ekranEtkin === false).length,
        tanimsizSayisi: uyeler.length - tanimli.length,
        uyarilar: sqlKosuUyarilari(denetim, denetim?.ekranSenaryolari, kosacak, o)
      };
    },
    not: 'Grup kısmi koşu olarak kaydedilir; Genel kartları ve trendi değiştirmez. Toplu koşuya dahil olmayan senaryolar atlanır.'
  });
  if (!y) return;
  kosuBaslat({ projeId: proje.id, ortam: y.ortam, senaryolar: y.senaryolar, tur: 'tekil', kapsam: grup.ad, esZamanli: false, baslik: `${grup.ad} (${y.senaryolar.length} senaryo)`, veriKipi: y.veriKipi, uygulamaSurumu: y.uygulamaSurumu });
}

/**
 * "Koşu grupları" bölümü: kayıtlı gruplar (Çalıştır · Düzenle · Sil) ve "Koşu oluştur". Testlerim ve Senaryolar kullanır.
 * @param {HTMLElement} kap
 * @param {{ proje: { id: string; ad: string }; ortamlar: any[]; ortamId: () => string }} s
 * @returns {{ yenile: () => Promise<void>; olustur: () => Promise<void> }}
 */
export function kosuGruplariBolumu(kap, s) {
  const { proje, ortamlar } = s;
  const olustur = async () => { if (await kosuGrubuPenceresi({ proje })) await yenile(); };
  const olusturDugmesi = h('button', { type: 'button', class: 'kosu-olustur-dugmesi' }, ikon('arti'), 'Koşu oluştur');
  olusturDugmesi.addEventListener('click', () => { void olustur(); });
  const govde = h('div', { class: 'kosu-gruplari-govde', 'aria-live': 'polite' });
  kap.replaceChildren(h('div', { class: 'kosu-gruplari-basligi' }, h('h3', {}, 'Koşu grupları'), olusturDugmesi), govde);

  function satir(g) {
    const ekranSayisi = new Set((g.ekranlar || [])).size;
    const bilgi = [`${g.senaryoIdleri.length} senaryo`, ekranSayisi ? `${ekranSayisi} ekran` : '', g.kayipSayisi ? `${g.kayipSayisi} senaryo silinmiş` : ''].filter(Boolean).join(' · ');
    const calistir = h('button', { type: 'button', class: 'birincil', 'aria-label': `Çalıştır: ${g.ad}` }, ikon('oynat'), 'Çalıştır');
    calistir.disabled = !g.senaryoIdleri.length;
    calistir.addEventListener('click', () => { void kosuGrubunuCalistir({ proje, ortamlar, ortamId: s.ortamId(), grup: g }); });
    const duzenle = h('button', { type: 'button', class: 'hayalet', 'aria-label': `Düzenle: ${g.ad}` }, ikon('duzenle'), 'Düzenle');
    duzenle.addEventListener('click', async () => { if (await kosuGrubuPenceresi({ proje, grup: g })) await yenile(); });
    const sil = h('button', { type: 'button', class: 'hayalet', 'aria-label': `Sil: ${g.ad}` }, ikon('cop'), 'Sil');
    sil.addEventListener('click', async () => {
      const tamam = await onayIste({ baslik: 'Koşu grubu silinsin mi?', ikonAd: 'cop', tehlikeli: true, dugme: 'Sil', metin: `"${g.ad}" grubu silinir. Senaryolarınıza dokunulmaz; yalnız bu seçim kalkar.` });
      if (!tamam) return;
      try {
        await api('/platform/kosu-gruplari/sil', { govde: { projeId: proje.id, id: g.id } });
        bildir(`"${g.ad}" grubu silindi.`);
        await yenile();
      } catch (e) { if (!(e && e.durum === 423)) bildir(hataMetni(e), 'hata'); }
    });
    return h('li', { class: 'kosu-grubu-satiri' }, h('div', { class: 'kosu-grubu-bilgi' }, h('b', {}, g.ad), h('span', { class: 'soluk kucuk' }, bilgi)),
      h('div', { class: 'kosu-grubu-eylemleri' }, calistir, duzenle, sil));
  }

  async function yenile() {
    try {
      const [{ gruplar }, veri] = await Promise.all([api(`/platform/kosu-gruplari?projeId=${encodeURIComponent(proje.id)}`), birlesikListe(proje.id)]);
      const ekranKimligi = new Map((veri.senaryolar || []).map((x) => [x.id, x.ekranId]));
      for (const g of gruplar) g.ekranlar = g.senaryoIdleri.map((id) => ekranKimligi.get(id)).filter(Boolean);
      govde.replaceChildren(gruplar.length ? h('ul', { class: 'kosu-gruplari-listesi' }, gruplar.map(satir))
        : h('p', { class: 'soluk kucuk' }, 'Henüz koşu grubu yok. "Koşu oluştur" ile farklı ekranlardan senaryolar seçip ad verin (ör. Regresyon testi).'));
    } catch (e) {
      if (!(e && e.durum === 423)) govde.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hataMetni(e)));
    }
  }
  void yenile();
  return { yenile, olustur };
}

/**
 * Gelişmiş modda Senaryolar sayfasından açılan "Koşu grupları" penceresi (aynı bölüm).
 * @param {{ proje: { id: string; ad: string }; ortamlar: any[]; ortamId: () => string }} s
 */
export function kosuGruplariPenceresi(s) {
  const kimlik = yeniKimlik('kosu-gruplari-penceresi');
  const kap = h('div', { class: 'kosu-gruplari' });
  kosuGruplariBolumu(kap, s);
  const kapat = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
  const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay', 'aria-label': 'Koşu grupları', id: kimlik }, h('div', { class: 'diyalog-govde' }, kap), h('div', { class: 'diyalog-alt' }, kapat));
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
}
