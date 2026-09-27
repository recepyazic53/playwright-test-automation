// AYARLAR > KOŞU > ZAMANLANMIŞ KOŞULAR — Nöbetçi'nin belirli zamanlarda kendiliğinden koşu başlatması (kullanıcı kararı).
// Kurallar kasada şifreli saklanır (sunucu: scripts/platform/zamanlama/*.mjs). Bu ekran hiçbir koşu BAŞLATMAZ ("Şimdi koş" yok;
// elle koşu için Senaryolar > "Koşuyu başlat"). Kural listesi: sonraki çalışma, son çalışma + sonucu, etkin anahtarı, son 20 tetikleme.
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, rozet, tarihMetni, yeniKimlik, yerlestir } from './ortak.js';
import { onayIste } from './ekran-ortak.js';
import { riskliOrtamMi } from './kosu-paneli.js';

const GUNLER = [[1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [7, 'Paz']];
const ARALIKLAR = [1, 2, 3, 4, 6, 8, 12];
const DURUM = {
  calisiyor: ['Çalışıyor', 'uyari'], tamamlandi: ['Başarılı', 'basari'], basarisiz: ['Kalan var', 'hata'],
  atlandi: ['Atlandı', 'durdu'], yarida: ['Yarıda kaldı', 'uyari'], hata: ['Başlatılamadı', 'hata']
};
const durumRozeti = (d) => { const [m, t] = DURUM[d] || [d, '']; return rozet(m, t); };
const ortamRiskli = (o) => Boolean(o && (o.canli || riskliOrtamMi(o)));
const KILAVUZ = 'Zamanlanmış koşular yalnız Nöbetçi açıkken (sunucu çalışırken) ve kasa AÇIKKEN çalışır; zamanlar bu bilgisayarın saatine göredir. '
  + 'Kasa kilitliyken ya da Nöbetçi kapalıyken kaçan zamanlar sonradan toplu koşulmaz: bir sonraki zaman beklenir. Otomatik kilit süresi '
  + '(Ayarlar > Güvenlik) dolunca kasa kilitlenir. Vakti geldiğinde başka bir koşu sürüyorsa o zaman atlanır ("Atlandı: koşu sürüyordu"). '
  + 'Koşular "Koşuyu başlat" ile aynı yoldan yapılır; sonuçlar Sonuçlar\'a düşer.';

/**
 * Ayarlar > Koşu içindeki "Zamanlanmış koşular" kartı.
 * @param {{ id: string; ad: string }} proje
 */
export async function zamanlanmisKosularKarti(proje) {
  const kart = h('section', { class: 'kart form-paneli zamanlanmis-kosular', 'aria-label': 'Zamanlanmış koşular' });
  const ciz = async () => {
    const q = `projeId=${encodeURIComponent(proje.id)}`;
    const bos = (anahtar) => () => ({ [anahtar]: [] });
    const [veri, { ortamlar }, ekranYaniti, akisYaniti, entYaniti] = await Promise.all([
      api(`/platform/zamanlanmis-kosular?${q}`), api(`/platform/ortamlar?${q}`),
      api(`/platform/ekranlar?${q}`).catch(bos('ekranlar')), api(`/platform/servis-akislari?${q}`).catch(bos('akislar')),
      api(`/platform/entegrasyonlar?${q}`).catch(() => ({ turler: [], baglantilar: [] }))
    ]);
    const ekranlar = (ekranYaniti.ekranlar || []).filter((e) => e.modelTuru !== 'altModel');
    const akislar = (akisYaniti.akislar || []).filter((a) => a.tur !== 'oturum');
    const bildirimTurleri = new Set((entYaniti.turler || []).filter((t) => (t.olaylar || []).some((o) => o.ad === 'kosu-bitti')).map((t) => t.tur));
    const webhooklar = (entYaniti.baglantilar || []).filter((b) => bildirimTurleri.has(b.tur));
    const secenekler = { proje, ortamlar, ekranlar, akislar, webhooklar };
    const formAlani = h('div', { class: 'zamanlama-form-alani' });
    const formAc = (kural) => {
      yerlestir(formAlani, kuralFormu({ ...secenekler, kural, kapat: () => formAlani.replaceChildren(), kaydedildi: () => { void ciz(); } }));
      formAlani.scrollIntoView({ block: 'nearest' });
    };
    const ekle = h('button', { type: 'button', class: 'birincil', onclick: () => formAc(null) }, '+ Zamanlanmış koşu ekle');
    yerlestir(kart,
      h('div', { class: 'bolum-basligi' }, h('h3', {}, ikon('tarih'), 'Zamanlanmış koşular', rozet(String(veri.kurallar.length))), ekle),
      h('p', { class: 'soluk' }, KILAVUZ),
      veri.suren ? h('div', { class: 'not-kutusu uyari', role: 'status' }, `Şu an zamanlanmış koşu sürüyor: "${veri.suren.ad}".`) : null,
      formAlani,
      veri.kurallar.length ? h('ul', { class: 'kayit-listesi zamanlama-listesi' }, veri.kurallar.map((k) => kuralSatiri(k, { ...secenekler, duzenle: formAc, yenile: ciz })))
        : bosDurum('Zamanlanmış koşu yok.', 'Nöbetçi\'nin belirli zamanlarda kendiliğinden koşu başlatması için "+ Zamanlanmış koşu ekle"ye basın.', { ikon: 'tarih', rol: 'status' }));
  };
  await ciz();
  return kart;
}

function kapsamMetni(k, s) {
  const ekranAdi = (id) => (s.ekranlar.find((e) => e.id === id) || { ad: 'silinmiş ekran' }).ad;
  const akisAdi = (id) => (s.akislar.find((a) => a.id === id) || { baslik: 'silinmiş akış' }).baslik;
  const parcalar = [];
  if (k.kapsam.senaryolar === 'tum') parcalar.push('Tüm "Koşuda" senaryolar');
  else if (k.kapsam.senaryolar === 'ekranlar') parcalar.push(`Ekranlar: ${k.kapsam.ekranIdleri.map(ekranAdi).join(', ')}`);
  if (k.kapsam.servisAkisIdleri.length) parcalar.push(`Servis akışları: ${k.kapsam.servisAkisIdleri.map(akisAdi).join(', ')}`);
  return parcalar.join(' · ');
}

const sonucBaglantisi = (t) => (t.kosuId ? h('a', { href: `#/sonuclar/kosu/${encodeURIComponent(t.kosuId)}` }, 'Sonuçları aç') : null);

function kuralSatiri(k, s) {
  const etkin = h('input', { type: 'checkbox', class: 'anahtar', checked: k.etkin, role: 'switch', 'aria-label': `${k.ad}: etkin` });
  etkin.addEventListener('change', async () => {
    etkin.disabled = true;
    try {
      await api('/platform/zamanlanmis-kosu/etkin', { govde: { projeId: s.proje.id, id: k.id, etkin: etkin.checked } });
      bildir(etkin.checked ? `"${k.ad}" etkinleştirildi; bundan sonraki zamanlarda çalışır.` : `"${k.ad}" pasifleştirildi.`);
      await s.yenile();
    } catch (hata) { etkin.checked = !etkin.checked; etkin.disabled = false; bildir(hata.message, 'hata'); }
  });
  const sil = h('button', { type: 'button', class: 'kucuk-dugme tehlike', 'aria-label': `${k.ad}: sil` }, ikon('cop'), 'Sil');
  sil.addEventListener('click', async () => {
    const tamam = await onayIste({ baslik: 'Zamanlanmış koşuyu sil', metin: `"${k.ad}" ve tetikleme geçmişi silinecek. Koşu sonuçları silinmez.`, dugme: 'Sil', tehlikeli: true });
    if (!tamam) return;
    try {
      await api('/platform/zamanlanmis-kosu/sil', { govde: { projeId: s.proje.id, id: k.id } });
      bildir('Zamanlanmış koşu silindi.');
      await s.yenile();
    } catch (hata) { bildir(hata.message, 'hata'); }
  });
  const son = k.sonTetikleme;
  const gecmis = h('details', { class: 'zamanlama-gecmisi' }, h('summary', {}, `Geçmiş (son ${k.gecmis.length} tetikleme)`),
    k.gecmis.length ? h('table', { class: 'veri-tablosu' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Zaman'), h('th', {}, 'Durum'), h('th', {}, 'Ayrıntı'), h('th', {}, 'Sonuç'))),
      h('tbody', {}, k.gecmis.map((t) => h('tr', {},
        h('td', {}, tarihMetni(t.zaman)), h('td', {}, durumRozeti(t.durum)), h('td', { class: 'kucuk' }, t.mesaj || '—'), h('td', {}, sonucBaglantisi(t) || '—')))))
      : h('p', { class: 'soluk kucuk' }, 'Henüz tetiklenmedi.'));
  return h('li', { class: k.etkin ? null : 'pasif-kayit' },
    h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon('tarih')),
    h('div', { class: 'kayit-ana' },
      h('strong', {}, k.ad, k.etkin ? null : rozet('Pasif', 'durdu'), k.riskli ? rozet('Canlı / riskli ortam', 'hata') : null),
      h('div', { class: 'kayit-meta' }, [k.zamanMetni, k.ortamAdi || 'silinmiş ortam', kapsamMetni(k, s), k.bildirimAdi ? `Bildirim: ${k.bildirimAdi}` : null].filter(Boolean).join(' · ')),
      h('div', { class: 'kayit-meta' }, k.etkin ? `Sonraki çalışma: ${tarihMetni(k.sonrakiCalisma)}` : 'Pasif: çalışmaz.'),
      son ? h('div', { class: 'kayit-meta zamanlama-son' }, `Son çalışma: ${tarihMetni(son.zaman)} `, durumRozeti(son.durum), son.mesaj ? ` ${son.mesaj} ` : ' ', sonucBaglantisi(son))
        : h('div', { class: 'kayit-meta soluk' }, 'Henüz çalışmadı.'),
      gecmis),
    h('div', { class: 'kayit-eylemleri' },
      h('label', { class: 'onay-satiri' }, etkin, 'Etkin'),
      h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${k.ad}: düzenle`, onclick: () => s.duzenle(k) }, ikon('duzenle'), 'Düzenle'),
      sil));
}

/** Onay kutusu listesi (ekranlar / servis akışları / günler). */
function kutuListesi(ogeler, secili, etiket) {
  const kutular = ogeler.map(([deger, metin]) => {
    const k = h('input', { type: 'checkbox', value: String(deger), checked: secili.includes(deger), id: yeniKimlik('zk') });
    return { k, el: h('label', { for: k.id }, k, metin) };
  });
  return {
    el: h('fieldset', { class: 'zamanlama-kutulari' }, h('legend', {}, etiket), h('div', { class: 'ortam-secimleri' }, kutular.map((x) => x.el))),
    secilenler: () => kutular.filter((x) => x.k.checked).map((x) => x.k.value),
    kutular: kutular.map((x) => x.k)
  };
}

function kuralFormu(s) {
  const k = s.kural;
  const mesaj = mesajKutusu();
  const ad = h('input', { type: 'text', maxlength: '80', value: k ? k.ad : '', placeholder: 'ör. Gece tam koşu', autocomplete: 'off' });
  const ortam = h('select', {}, s.ortamlar.map((o) => h('option', { value: o.id, selected: k ? k.ortamId === o.id : o.varsayilan }, o.ad)));

  // Kapsam
  const kapsamTuru = h('select', {},
    h('option', { value: 'tum' }, 'Tüm "Koşuda" senaryolar (tam koşu)'),
    h('option', { value: 'ekranlar' }, 'Seçili ekranların "Koşuda" senaryoları'),
    h('option', { value: 'yok' }, 'Senaryo yok (yalnız servis akışları)'));
  kapsamTuru.value = k ? k.kapsam.senaryolar : 'tum';
  const ekranKutulari = kutuListesi(s.ekranlar.map((e) => [e.id, e.durum === 'devre_disi' ? `${e.ad} (devre dışı)` : e.ad]), k ? k.kapsam.ekranIdleri : [], 'Ekranlar');
  const akisKutulari = kutuListesi(s.akislar.map((a) => [a.id, a.baslik]), k ? k.kapsam.servisAkisIdleri : [], 'Servis akışları (isteğe bağlı)');
  const kapsamGuncelle = () => { ekranKutulari.el.hidden = kapsamTuru.value !== 'ekranlar'; };
  kapsamTuru.addEventListener('change', kapsamGuncelle);
  kapsamGuncelle();

  // Zaman
  const z = k ? k.zaman : { tur: 'gunluk', saat: '07:00' };
  const zamanTuru = h('select', {},
    h('option', { value: 'gunluk' }, 'Her gün'), h('option', { value: 'haftalik' }, 'Haftanın seçili günleri'), h('option', { value: 'aralik' }, 'Her N saatte bir'));
  zamanTuru.value = z.tur;
  const saat = h('input', { type: 'time', value: z.saat || '07:00', step: '60' });
  const gunKutulari = kutuListesi(GUNLER, z.gunler || [1, 2, 3, 4, 5], 'Günler');
  const aralik = h('select', {}, ARALIKLAR.map((n) => h('option', { value: String(n), selected: n === (z.saatAraligi || 4) }, `${n} saatte bir`)));
  const baslangic = h('input', { type: 'time', value: z.baslangic || '00:00', step: '60' });
  const saatAlani = alan('Saat', saat);
  const aralikAlani = alan('Sıklık', aralik);
  const baslangicAlani = alan('Başlangıç saati', baslangic, { yardim: 'Gün içindeki saatler bu saatten başlayarak hesaplanır (ör. 00:30 ve 4 saat → 00:30, 04:30, 08:30 …).' });
  const onizleme = h('p', { class: 'soluk kucuk', 'aria-live': 'polite' });
  const zamanOku = () => (zamanTuru.value === 'gunluk' ? { tur: 'gunluk', saat: saat.value }
    : zamanTuru.value === 'haftalik' ? { tur: 'haftalik', saat: saat.value, gunler: gunKutulari.secilenler().map(Number) }
      : { tur: 'aralik', saatAraligi: Number(aralik.value), baslangic: baslangic.value });
  let onizlemeSirasi = 0;
  const onizle = async () => {
    const sira = ++onizlemeSirasi;
    try {
      const r = await api('/platform/zamanlanmis-kosu/onizle', { govde: { zaman: zamanOku() } });
      if (sira === onizlemeSirasi) onizleme.textContent = `${r.metin}. Sonraki çalışmalar: ${r.sonrakiler.map(tarihMetni).join(' · ')}`;
    } catch (hata) { if (sira === onizlemeSirasi) onizleme.textContent = hata.message; }
  };
  const zamanGuncelle = () => {
    saatAlani.hidden = zamanTuru.value === 'aralik';
    gunKutulari.el.hidden = zamanTuru.value !== 'haftalik';
    aralikAlani.hidden = zamanTuru.value !== 'aralik';
    baslangicAlani.hidden = zamanTuru.value !== 'aralik';
    void onizle();
  };
  for (const g of [zamanTuru, saat, aralik, baslangic, ...gunKutulari.kutular]) g.addEventListener('change', zamanGuncelle);
  zamanGuncelle();

  // Bildirim
  const bildirim = h('select', { disabled: !s.webhooklar.length },
    h('option', { value: '' }, 'Bildirim gönderme'),
    s.webhooklar.map((b) => h('option', { value: b.id, selected: k ? k.bildirimBaglantiId === b.id : false }, `${b.ad}${b.etkin ? '' : ' (devre dışı)'}`)));
  const bildirimAlani = alan('Sonuçları bildir', bildirim, {
    yardim: s.webhooklar.length ? 'Koşu bitince özet, seçtiğiniz webhook bağlantısına gönderilir (bağlantı devre dışıysa gönderilmez).'
      : 'Seçmek için Ayarlar > Entegrasyonlar\'da bir webhook bağlantısı ekleyin.'
  });

  // Canlı ortam onayı
  const canliOnay = h('input', { type: 'checkbox', checked: k ? k.canliOnay : false, id: yeniKimlik('zk-canli') });
  const canliKutusu = h('div', { class: 'not-kutusu hata', role: 'alert' },
    h('p', {}, h('strong', {}, 'Dikkat: '), 'Seçilen ortam canlı / riskli işaretli. Zamanlanmış koşu bu ortamda sizin başında olmadığınız bir anda gerçek işlemler yapabilir.'),
    h('label', { class: 'onay-satiri', for: canliOnay.id }, canliOnay, 'Canlı ortamda zamanlanmış koşuya izin veriyorum'));
  const riskGuncelle = () => { canliKutusu.hidden = !ortamRiskli(s.ortamlar.find((o) => o.id === ortam.value)); };
  ortam.addEventListener('change', riskGuncelle);
  riskGuncelle();

  const etkin = h('input', { type: 'checkbox', checked: k ? k.etkin : true, id: yeniKimlik('zk-etkin') });
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const form = h('form', { class: 'kart form-paneli zamanlama-formu', novalidate: true, 'aria-label': k ? `${k.ad}: düzenle` : 'Yeni zamanlanmış koşu' },
    h('h3', {}, k ? `Düzenle: ${k.ad}` : 'Yeni zamanlanmış koşu'), mesaj.kutu,
    alan('Ad', ad, { zorunlu: true }), alan('Ortam', ortam, { zorunlu: true }), canliKutusu,
    h('fieldset', {}, h('legend', {}, 'Ne koşulsun?'), alan('Senaryolar', kapsamTuru), ekranKutulari.el, s.akislar.length ? akisKutulari.el : null),
    h('fieldset', {}, h('legend', {}, 'Ne zaman?'), alan('Tekrar', zamanTuru), saatAlani, gunKutulari.el, aralikAlani, baslangicAlani, onizleme,
      h('p', { class: 'soluk kucuk' }, 'Kasa kilitliyken ya da Nöbetçi kapalıyken kaçan zamanlar sonradan koşulmaz; bir sonraki zaman beklenir.')),
    bildirimAlani,
    h('label', { class: 'onay-satiri', for: etkin.id }, etkin, 'Etkin'),
    h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'hayalet', onclick: () => s.kapat() }, 'Vazgeç'), kaydet));
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    alanHatasi(ad, '');
    if (!ad.value.trim()) { alanHatasi(ad, 'Bir ad girin.'); ad.focus(); return; }
    if (!canliKutusu.hidden && !canliOnay.checked) { mesaj.goster('Canlı / riskli ortam: kaydetmek için "Canlı ortamda zamanlanmış koşuya izin veriyorum" kutusunu işaretleyin.'); canliOnay.focus(); return; }
    const kural = {
      ...(k ? { id: k.id } : {}), ad: ad.value.trim(), ortamId: ortam.value,
      kapsam: { senaryolar: kapsamTuru.value, ekranIdleri: kapsamTuru.value === 'ekranlar' ? ekranKutulari.secilenler() : [], servisAkisIdleri: akisKutulari.secilenler() },
      zaman: zamanOku(), etkin: etkin.checked, bildirimBaglantiId: bildirim.value || null, canliOnay: !canliKutusu.hidden && canliOnay.checked
    };
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/zamanlanmis-kosu/kaydet', { govde: { projeId: s.proje.id, kural } }));
      bildir(k ? 'Zamanlanmış koşu güncellendi.' : 'Zamanlanmış koşu eklendi.');
      s.kapat();
      s.kaydedildi();
    } catch (hata) { mesaj.goster(hata.message); }
  });
  return form;
}
