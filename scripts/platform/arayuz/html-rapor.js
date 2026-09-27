// "Raporu indir (HTML)": koşu ayrıntısından (ekran sonuçları: sonuclar.js, servis sonuçları: servis-sonuclari.js) tek dosyalık,
// paylaşılabilir HTML rapor (karşılaştırma ekranında iki koşunun karşılaştırma raporu: hedef.b). Seçenekler kullanıcı kararıdır (diyalog; önizlemeli): ekran görüntüleri (varsayılan kapalı),
// hata mesajları (varsayılan açık), ortam adresi (varsayılan kapalı). Rapor sunucuda üretilir ve maskelenir
// (/platform/sonuclar/html-rapor; bkz. sonuclar/html-rapor.mjs). Önizleme betiksiz, korumalı bir iframe'dedir (sandbox=""):
// arayüzün CSP'si satır içi stile izin vermediğinden srcdoc değil, sunucunun tek kullanımlık önizleme adresi (kendi CSP'si) yüklenir.
import { TOKEN, api, boyutMetni, h, ikon, kullaniciAyarlari, yeniKimlik } from './ortak.js';

/** Bu boyutun üstündeki raporlarda uyarı gösterilir (e-posta ekleri çoğunlukla 10–25 MB ile sınırlı). */
const UYARI_BAYT = 10 * 1024 * 1024;

/**
 * b verilirse iki koşunun karşılaştırma raporu (id = A, b = B; karsilastirma.js).
 * @param {{ tur: 'ekran' | 'servis'; projeId: string; id: string; b?: string }} hedef
 * @returns {HTMLButtonElement}
 */
export function htmlRaporDugmesi(hedef) {
  return h('button', { type: 'button', class: 'dugme hayalet', onclick: () => raporDiyalogu(hedef) }, ikon('indir'), hedef.b ? 'Karşılaştırmayı indir (HTML)' : 'Raporu indir (HTML)');
}

/** @param {{ tur: 'ekran' | 'servis'; projeId: string; id: string; b?: string }} hedef */
function raporDiyalogu(hedef) {
  const kutu = (etiket, acik, aciklama) => {
    const girdi = h('input', { type: 'checkbox', id: yeniKimlik('rapor-secenek'), checked: acik });
    return { girdi, satir: h('label', { class: 'onay-satiri', for: girdi.id }, girdi, h('span', {}, etiket, aciklama ? h('span', { class: 'soluk kucuk rapor-secenek-notu' }, aciklama) : null)) };
  };
  const goruntu = kutu('Ekran görüntülerini ekle', false, 'Kasadaki şifreli görüntüler çözülüp rapora gömülür (en çok 25 MB). Dosya büyür.');
  // Sınır kullanıcının kararıdır (Ayarlar > Arayüz > Raporlar); metin ayar gelince güncellenir.
  void kullaniciAyarlari().then((a) => {
    const not = goruntu.satir.querySelector('.rapor-secenek-notu');
    if (not && Number(a.raporGoruntuSiniriMb) > 0) not.textContent = `Kasadaki şifreli görüntüler çözülüp rapora gömülür (en çok ${a.raporGoruntuSiniriMb} MB; Ayarlar > Arayüz). Dosya büyür.`;
  });
  const hatalar = kutu('Hata mesajlarını ekle', true, 'İlk satırlar, Beklenen / Görülen ve hata kalıpları (maskeli).');
  const adres = kutu('Ortam adresini göster', false, 'Kapalıyken hata metinlerindeki ortam adresi de gizlenir.');
  const bilgi = h('p', { class: 'soluk kucuk', role: 'status', 'aria-live': 'polite' }, 'Önizleme hazırlanıyor…');
  const onizleme = h('iframe', { class: 'html-rapor-onizleme', title: 'Rapor önizlemesi', sandbox: '', referrerpolicy: 'no-referrer' });
  const indir = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('indir'), 'İndir');
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const diyalog = h('dialog', { class: 'onay-diyalogu html-rapor-diyalogu', 'aria-labelledby': 'html-rapor-basligi' },
    h('div', { class: 'diyalog-govde' },
      h('div', { class: 'diyalog-baslik-satiri' }, h('h2', { id: 'html-rapor-basligi' }, hedef.b ? 'Karşılaştırmayı indir (HTML)' : 'Raporu indir (HTML)'), kapat),
      h('p', { class: 'soluk' }, 'Tek dosya; internet bağlantısı gerektirmez, yazdırılabilir. Gizli değerler her zaman maskelenir; giriş bilgisi, '
        + 'istek / yanıt gövdesi ve test verisinin gizli sütunları rapora girmez.'),
      h('fieldset', { class: 'html-rapor-secenekleri' }, h('legend', {}, 'Rapora eklenecekler'), goruntu.satir, hatalar.satir, adres.satir),
      bilgi,
      onizleme,
      h('div', { class: 'dugmeler' }, indir, h('button', { type: 'button', onclick: () => diyalog.close() }, 'Vazgeç'))));

  /** @type {{ html: string; dosyaAdi: string } | null} */
  let son = null;
  let sira = 0;
  const yenile = async () => {
    const benim = ++sira;
    son = null;
    indir.disabled = true;
    bilgi.textContent = goruntu.girdi.checked ? 'Rapor hazırlanıyor (görüntüler çözülüyor)…' : 'Rapor hazırlanıyor…';
    const q = new URLSearchParams({
      projeId: hedef.projeId, tur: hedef.tur, id: hedef.id, ...(hedef.b ? { b: hedef.b } : {}),
      goruntuler: goruntu.girdi.checked ? '1' : '0', hatalar: hatalar.girdi.checked ? '1' : '0', adres: adres.girdi.checked ? '1' : '0'
    });
    try {
      const r = await api(`/platform/sonuclar/html-rapor?${q}`);
      if (benim !== sira) return;
      son = { html: r.html, dosyaAdi: r.dosyaAdi };
      onizleme.src = `/platform/sonuclar/html-rapor/onizleme/${encodeURIComponent(r.onizlemeId)}?token=${encodeURIComponent(TOKEN)}`;
      const parcalar = [`Boyut: ${boyutMetni(r.boyut)}`, `Dosya: ${r.dosyaAdi}`];
      if (goruntu.girdi.checked) parcalar.push(`gömülü görüntü: ${r.goruntu.eklenen}${r.goruntu.atlanan ? ` (sınır nedeniyle eklenmeyen: ${r.goruntu.atlanan})` : ''}`);
      if (r.boyut > UYARI_BAYT) parcalar.push('Uyarı: dosya büyük; e-posta ekine sığmayabilir.');
      bilgi.textContent = parcalar.join(' · ');
      indir.disabled = false;
    } catch (hata) {
      if (benim !== sira) return;
      onizleme.removeAttribute('src');
      bilgi.textContent = `Rapor hazırlanamadı: ${hata.message || hata}`;
    }
  };
  for (const k of [goruntu, hatalar, adres]) k.girdi.addEventListener('change', yenile);
  indir.addEventListener('click', () => {
    if (!son) return;
    const url = URL.createObjectURL(new Blob([son.html], { type: 'text/html;charset=utf-8' }));
    const a = h('a', { href: url, download: son.dosyaAdi, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => { sira++; diyalog.remove(); });
  document.body.append(diyalog);
  diyalog.showModal();
  yenile();
}
