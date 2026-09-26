// YEREL FİKSTÜR — JetSeyahat benzeri seyahat ekranı (girişsiz; 127.0.0.1). "JetSeyahat (akış)" paketinin
// (projeler/galaksi/jetseyahat-akis.mjs) model koşucusuyla uçtan uca denenmesi içindir. Seçiciler ve davranış
// JetSeyahat POM'undakilerle aynıdır: oklu kapsam/alternatif (halka), gizli çizimli radyolar, AJAX ile gelen ülke
// listesi, tekli/çoklu sorgu, T.C. yazılıp Tab'a basılınca ad-soyadın gecikmeli gelmesi, ettiren kimlik sorgusu,
// Excel yüklenince sigortalı satırları ve "Hesapla" → prim ya da diyalogda iş kuralı uyarısı. TEST ekranında görülenler de
// taklit edilir: kapsam/alternatif SPAN, alternatif kapsama bağlı, iptal bedeli (#Bedel_Select) yalnızca SEYAHAT PAKET'te
// etkin, eksik ülke / sigortalı kimliği için TARAYICI UYARISI (alert).
// Şirket sitesine hiçbir istek gitmez.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const SEYAHAT_YOLU = '/jet-satis/jet-seyahat/';
/** COVID teminatı "Hayır" iken yalnızca vize ürünleri hesaplanır (fikstürün iş kuralı). */
export const SEYAHAT_IS_KURALI = 'COVID teminatı olmadan yalnızca vize alternatifleri hesaplanabilir.';
const KAPSAMLAR = ['DÜNYA', 'AVRUPA'];
const ALTERNATIFLER: Record<string, string[]> = { 'DÜNYA': ['VİZE TÜM DÜNYA', 'SEYAHAT PAKET'], 'AVRUPA': ['VİZE SCHENGEN', 'SEYAHAT PAKET'] };
export const ULKE_UYARISI = 'Lütfen seyahat edilecek ülkeyi seçiniz.';
export const KIMLIK_UYARISI = 'Lütfen sigortalı kimlik numaralarını geçerli şekilde giriniz.';

export type SeyahatHesaplamasi = Record<string, unknown>;
/** Ödeme sonucu (TEST'te test kartıyla poliçe kesilmez; kodlu testlerin kabul ettiği sonuç). */
export const ODEME_SONUCU = 'Hiçbir poliçe onaylanamadı.';

const html = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>JetSeyahat</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}.tb{display:flex;gap:6px;align-items:center}
.tb img{width:18px;height:18px;cursor:pointer;background:#ccd}.radyo{position:relative;display:inline-block;margin-right:12px}
.radyo input{position:absolute;opacity:0;width:14px;height:14px;margin:0}.radyo span{padding-left:18px}
#dialog{border:1px solid #b00;padding:8px}</style></head><body>${govde}</body></html>`
});
const json = (veri: unknown): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(veri) });

export class SeyahatUygulamasi {
  readonly hesaplamalar: SeyahatHesaplamasi[] = [];
  /** Ödeme istekleri (kart alanları; yerel fikstür, sahte kart). */
  readonly odemeler: Array<Record<string, unknown>> = [];
  readonly olaylar: string[] = [];

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.olaylar.push(`${i.yontem} ${i.yol}`);
    if (i.yol === SEYAHAT_YOLU || i.yol === SEYAHAT_YOLU.slice(0, -1)) return this.sayfa();
    if (i.yol.startsWith('/jet-satis/jet-seyahat/ulke-listesi/')) return json([{ deger: '15', metin: 'ALMANYA' }, { deger: '22', metin: 'FRANSA' }]);
    if (i.yol === '/seyahat/kimlik') {
      const no = i.sorgu.get('no') ?? '';
      return json({ ad: no ? (no.length === 10 ? `UNVAN ${no.slice(-3)} A.Ş.` : `KİŞİ ${no.slice(-3)}`) : '' });
    }
    if (i.yol === '/seyahat/odeme' && i.yontem === 'POST') {
      this.odemeler.push(JSON.parse(i.govde || '{}') as Record<string, unknown>);
      return json({ mesaj: ODEME_SONUCU });
    }
    if (i.yol === '/seyahat/hesapla' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Record<string, unknown>;
      this.hesaplamalar.push(g);
      if (g.covid === 'H' && !String(g.alternatif).startsWith('VİZE')) return json({ hata: SEYAHAT_IS_KURALI });
      const kisi = g.sorguTipi === '2' ? Number(g.cokluKisi || 0) : Number(g.sigortaliSayisi || 0);
      if (!g.baslangic || !g.bitis || !g.ulke || kisi < 1) return json({ hata: 'Eksik bilgi.' });
      return json({ prim: (kisi * (g.kapsam === 'DÜNYA' ? 42.5 : 18.25) * (g.kayak ? 1.2 : 1)).toFixed(2) });
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private sayfa(): FiksturYaniti {
    const ok = (ad: string, kimlik: string) => `<div class="tb" id="syh-${ad}-tb">
      <img alt="" onclick="Decrease('${ad}')"><span id="${kimlik}"></span><img alt="" onclick="Increase('${ad}')"></div>`;
    const radyo = (ad: string, deger: string, metin: string, secili = false) =>
      `<label class="radyo"><input type="radio" name="${ad}" id="${ad}-${deger}" value="${deger}"${secili ? ' checked' : ''}><span>${metin}</span></label>`;
    return html(`<h1>JetSeyahat</h1>
      <section id="police"><h2>Poliçe bilgileri</h2>
        <div>Kapsam ${ok('kapsam', 'kapsam-text')}</div>
        <div>Alternatif ${ok('alternatif', 'alternatif-text')}</div>
        <label>Başlangıç <input id="from"></label><label>Bitiş <input id="to"></label>
        <label>COVID teminatı <select id="covid-teminati"><option value="E">Evet</option><option value="H">Hayır</option></select></label>
        <label><input type="checkbox" id="kayak"> Kayak teminatı</label>
        <label>Seyahat iptal bedeli <select id="Bedel_Select" disabled><option value="1">1.000</option><option value="2">2.000</option><option value="3">3.000</option><option value="4">5.000</option><option value="5">500</option></select></label>
        <select id="cmbIpt" hidden><option value="-1">SEÇİNİZ</option></select>
        <label>Plan <select id="Plan_Select"><option value="1">Plan 1</option><option value="2">Plan 2</option><option value="3">Plan 3</option></select></label>
        <label>Ülke <select id="cmbCountries"><option value="">Seçiniz</option></select></label>
        <label>Sorgu tipi <select id="selectAllClientPolicy"><option value="1">Tekli</option><option value="2">Çoklu</option></select></label>
        <div id="tekli-kutu"><label>Sigortalı sayısı <input id="sigortali_sayisi"></label></div>
        <div id="coklu-kutu" hidden><label>Liste <input type="file" id="fileinsuredlist"></label>
          <table id="InsurerList"><tbody></tbody></table></div>
      </section>
      <section id="sigortali"><h2>Sigortalı</h2>
        <label>Doğum tarihi <input id="insurers-1-birthday"></label>
        <label>Cep telefonu <input id="insurers-1-tel"></label>
        <label>T.C. kimlik no <input id="insurer-1-textbox"></label>
        <table><tr><td id="insurer-1-fullname"></td></tr></table>
      </section>
      <section id="ettiren"><h2>Sigorta ettiren</h2>
        ${radyo('DifferentClient', 'H', 'Sigortalı ile aynı', true)}${radyo('DifferentClient', 'E', 'Farklı')}
        <div id="ettiren-kutu" hidden>
          ${radyo('ClientType', 'O', 'Özel', true)}${radyo('ClientType', 'T', 'Tüzel')}
          <label id="dogum-kutu">Doğum tarihi <input id="BirthDate"></label>
          <label>Cep telefonu <input id="ClientPhoneNumber"></label>
          <label>Kimlik no <input id="ClientIdentityNo"></label><button id="RefreshClientIdentity" type="button">Sorgula</button>
          <span id="client-identity-name"></span>
        </div>
      </section>
      <section id="islemler"><button id="Refresh" type="button">Hesapla</button>
        <p>Toplam prim (EUR): <span id="premium-total-eur">0,00</span></p>
        <button id="Policelestir" type="button" hidden>Poliçeleştir</button>
        <div id="fancybox-wrap" hidden><a href="#" id="kart-baglantisi">KREDİ KARTI İLE POLİÇELEŞTİR</a></div>
        <div id="kart-formu" hidden>
          <label>Kart üzerindeki isim <input id="isim"></label><label>Kart üzerindeki soyisim <input id="soyisim"></label>
          <label>Kart numarası <input id="kartno"></label><label>Güvenlik kodu (CVV) <input id="cvv"></label>
          <label>Ay <select id="ay">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></label>
          <label>Yıl <select id="yil">${Array.from({ length: 11 }, (_, i) => `<option value="${2026 + i}">${2026 + i}</option>`).join('')}</select></label>
          <label>Taksit <select id="taksit"><option value="1">Tek Çekim</option><option value="3">3 Taksit</option></select></label>
          <a href="#" id="odemeyi-tamamla">Ödemeyi tamamla</a>
        </div>
        <div id="dialog" hidden><div id="dialog-content"></div></div></section>
      <script>
        const K = ${JSON.stringify(KAPSAMLAR)}; const A = ${JSON.stringify(ALTERNATIFLER)};
        const I = { kapsam: 0, alternatif: 0 };
        const $ = (id) => document.getElementById(id);
        const liste = (ad) => (ad === 'kapsam' ? K : A[K[I.kapsam]]);
        const yaz = () => {
          $('kapsam-text').textContent = K[I.kapsam]; $('alternatif-text').textContent = A[K[I.kapsam]][I.alternatif];
          // İptal bedeli yalnızca SEYAHAT PAKET'te etkin (TEST ekranı).
          $('Bedel_Select').disabled = $('alternatif-text').textContent !== 'SEYAHAT PAKET';
        };
        // Halka: uçta başa döner; değer kısa bir gecikmeyle yazılır. Kapsam değişince alternatif listenin başına döner.
        // Gerçek ekran gibi: her değişiklikte ülke listesi gecikmeli yeniden yüklenir (seçili ülke sıfırlanır).
        const ulkeleriYukle = async () => {
          const l = await (await fetch('/jet-satis/jet-seyahat/ulke-listesi/' + encodeURIComponent($('kapsam-text').textContent || 'x'))).json();
          $('cmbCountries').length = 1; for (const u of l) $('cmbCountries').add(new Option(u.metin, u.deger));
        };
        const degis = (ad, adim) => { const n = liste(ad).length; I[ad] = (I[ad] + adim + n) % n; if (ad === 'kapsam') I.alternatif = 0;
          setTimeout(yaz, 60); setTimeout(ulkeleriYukle, 700); };
        window.Increase = (ad) => degis(ad, 1);
        window.Decrease = (ad) => degis(ad, -1);
        yaz();
        setTimeout(ulkeleriYukle, 300);
        const tip = () => { const t = $('selectAllClientPolicy').value;
          $('tekli-kutu').hidden = t !== '1'; $('coklu-kutu').hidden = t !== '2'; $('sigortali').hidden = t !== '1'; };
        $('selectAllClientPolicy').onchange = tip;
        $('fileinsuredlist').onchange = () => {
          const f = $('fileinsuredlist').files[0]; if (!f) return;
          const govde = $('InsurerList').tBodies[0];
          govde.innerHTML = '<tr class="syh-tc-tr"><td id="i-1-fullname"></td></tr><tr class="syh-tc-tr"><td id="i-2-fullname"></td></tr>';
          setTimeout(() => { $('i-1-fullname').textContent = 'LİSTE KİŞİ 1'; $('i-2-fullname').textContent = 'LİSTE KİŞİ 2'; }, 400);
        };
        $('insurer-1-textbox').addEventListener('change', async () => {
          const no = $('insurer-1-textbox').value; $('insurer-1-fullname').textContent = '';
          const r = await (await fetch('/seyahat/kimlik?no=' + encodeURIComponent(no))).json();
          setTimeout(() => { $('insurer-1-fullname').textContent = r.ad; }, 300);
        });
        document.querySelectorAll('input[name=DifferentClient]').forEach((r) => r.addEventListener('change', () => {
          $('ettiren-kutu').hidden = document.querySelector('input[name=DifferentClient]:checked').value !== 'E'; }));
        document.querySelectorAll('input[name=ClientType]').forEach((r) => r.addEventListener('change', () => {
          $('dogum-kutu').hidden = document.querySelector('input[name=ClientType]:checked').value !== 'O'; }));
        $('RefreshClientIdentity').onclick = async () => {
          $('client-identity-name').textContent = '';
          const r = await (await fetch('/seyahat/kimlik?no=' + encodeURIComponent($('ClientIdentityNo').value))).json();
          setTimeout(() => { $('client-identity-name').textContent = r.ad; }, 300);
        };
        // Ödeme (Galaksi'deki gibi): Poliçeleştir → pencerede kredi kartı bağlantısı → kart formu → "Ödemeyi tamamla" → uyarı.
        $('Policelestir').onclick = () => { setTimeout(() => { $('fancybox-wrap').hidden = false; }, 150); };
        $('kart-baglantisi').onclick = (o) => { o.preventDefault(); $('fancybox-wrap').hidden = true; $('kart-formu').hidden = false; };
        $('odemeyi-tamamla').onclick = async (o) => {
          o.preventDefault();
          const govde = { isim: $('isim').value, soyisim: $('soyisim').value, kartNo: $('kartno').value, cvv: $('cvv').value, ay: $('ay').value, yil: $('yil').value, taksit: $('taksit').value };
          const r = await (await fetch('/seyahat/odeme', { method: 'POST', body: JSON.stringify(govde) })).json();
          setTimeout(() => alert(r.mesaj), 200);
        };
        $('Refresh').onclick = async () => {
          $('dialog').hidden = true; $('premium-total-eur').textContent = '0,00';
          // İstemci doğrulaması tarayıcı uyarısıyla (alert), TEST ekranındaki metinlerle.
          if (!$('cmbCountries').value) { alert(${JSON.stringify(ULKE_UYARISI)}); return; }
          if ($('selectAllClientPolicy').value === '1' && !$('insurer-1-textbox').value) { alert(${JSON.stringify(KIMLIK_UYARISI)}); return; }
          const farkli = document.querySelector('input[name=DifferentClient]:checked').value === 'E';
          const govde = { kapsam: $('kapsam-text').textContent, alternatif: $('alternatif-text').textContent, baslangic: $('from').value, bitis: $('to').value,
            covid: $('covid-teminati').value, kayak: $('kayak').checked, iptal: $('Bedel_Select').disabled ? null : $('Bedel_Select').value, plan: $('Plan_Select').value,
            ulke: $('cmbCountries').value, sorguTipi: $('selectAllClientPolicy').value, sigortaliSayisi: $('sigortali_sayisi').value,
            cokluKisi: document.querySelectorAll('#InsurerList tr.syh-tc-tr').length,
            sigortali: $('selectAllClientPolicy').value === '1' ? { dogum: $('insurers-1-birthday').value, tel: $('insurers-1-tel').value,
              tc: $('insurer-1-textbox').value, ad: $('insurer-1-fullname').textContent } : null,
            ettiren: farkli ? { tip: document.querySelector('input[name=ClientType]:checked').value, dogum: $('dogum-kutu').hidden ? null : $('BirthDate').value,
              tel: $('ClientPhoneNumber').value, no: $('ClientIdentityNo').value, ad: $('client-identity-name').textContent } : null };
          const r = await (await fetch('/seyahat/hesapla', { method: 'POST', body: JSON.stringify(govde) })).json();
          await new Promise((c) => setTimeout(c, 200));
          if (r.hata) { $('dialog-content').textContent = r.hata; $('dialog').hidden = false; return; }
          $('premium-total-eur').textContent = r.prim.replace('.', ',');
          $('Policelestir').hidden = false;
        };
      </script>`);
  }
}
