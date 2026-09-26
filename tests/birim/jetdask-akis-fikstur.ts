// YEREL FİKSTÜR — JetDASK benzeri yeni iş ekranı (girişsiz; 127.0.0.1). "JetDASK (akış)" paketinin
// (projeler/galaksi/jetdask-akis.mjs) model koşucusuyla uçtan uca denenmesi içindir. Seçiciler ve davranış JetDASK
// POM'undakilerle aynıdır: yenileme / sigortalı tipi radyoları (gizli çizimli), tipe göre görünen doğum tarihi / uyruk /
// sorgu düğmesi (T.C.-VKN: #RefreshIdentity, pasaport: #QueryPassportNumber), sorgu sürerken "Aranıyor…" yazan ad alanı ve
// sorgu bitince telefon alanının yeniden oluşturulması (boşalır), sigortalı tipi değişince sıfat listesinin yavaş (7 sn)
// yeniden yüklenmesi (seçimi siler), UAVT adres sorgusu (#DR gecikmeli dolar), tapu ve poliçe
// alanları, "Hesapla" → prim ve "Poliçeleştir" → kart formu doğrudan (TEST ekranında görüldü).
// Şirket sitesine hiçbir istek gitmez.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const DASK_YOLU = '/jet-satis/jet-dask/';
/** Ödeme sonucu (TEST'te test kartıyla poliçe kesilmez). */
export const DASK_ODEME_SONUCU = 'Hiçbir poliçe onaylanamadı.';
/** Liste seçenekleri: TEST ekranındaki değer / metinlerden bir alt küme (projeler/galaksi/jetdask-secenekler.mjs). */
export const DASK_LISTELERI: Record<string, Array<[string, string]>> = {
  InsurerType: [['1', 'MAL SAHIBI'], ['2', 'KIRACI']],
  UsageType: [['5', 'MESKEN'], ['6', 'TICARETHANE']],
  BuildType: [['4', 'ÇELIK,BETONARME,KARKAS'], ['5', 'DIGER YAPILAR']],
  BuildYear: [['6', '1975 VE ÖNCESİ'], ['9', '2007-2019'], ['10', '2020 VE SONRASI']],
  TotalFloor: [['5', '01-03 ARASI KAT'], ['6', '04-07 ARASI KAT']],
  AnteriorDamage: [['0', 'HASARSIZ'], ['1', 'AZ HASARLI']],
  KT: [['0', 'ZEMIN KAT'], ['3', '3. KAT']],
  Nationality: [['DE', 'ALMANYA'], ['FR', 'FRANSA']]
};

export type DaskHesaplamasi = Record<string, unknown>;

const html = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>JetDASK</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}.radyo{position:relative;display:inline-block;margin-right:12px}
.radyo input{position:absolute;opacity:0;width:14px;height:14px;margin:0}.radyo span{padding-left:18px}</style></head><body>${govde}</body></html>`
});
const json = (veri: unknown): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(veri) });

export class DaskUygulamasi {
  readonly hesaplamalar: DaskHesaplamasi[] = [];
  readonly odemeler: Array<Record<string, unknown>> = [];
  readonly olaylar: string[] = [];

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.olaylar.push(`${i.yontem} ${i.yol}`);
    if (i.yol === DASK_YOLU || i.yol === DASK_YOLU.slice(0, -1)) return this.sayfa();
    if (i.yol === '/dask/kimlik') {
      const no = i.sorgu.get('no') ?? '';
      const tel = i.sorgu.get('tel') ?? '';
      // Kodlu testteki gibi: telefon olmadan sorgu reddedilir.
      if (!no || !tel) return json({ Status: false, Data: 'Telefon ve kimlik no zorunludur.' });
      return json({ Status: true, Data: i.sorgu.get('tip') === 'T' ? `UNVAN ${no.slice(-3)} A.Ş.` : `KİŞİ ${no.slice(-3)}` });
    }
    if (i.yol === '/dask/uavt') return json({ Status: true, Data: i.sorgu.get('ak') ?? '' });
    // Bağımlı liste: sigortalı tipine göre sigorta ettiren sıfatları (yavaş sunucu; beklenmezse sonraki adımda seçilen sıfatı siler).
    if (i.yol === '/dask/sifat-listesi') return { ...json(DASK_LISTELERI.InsurerType), gecikmeMs: 7000 };
    if (i.yol === '/dask/odeme' && i.yontem === 'POST') {
      this.odemeler.push(JSON.parse(i.govde || '{}') as Record<string, unknown>);
      return json({ mesaj: DASK_ODEME_SONUCU });
    }
    if (i.yol === '/jet-satis/jet-dask/hesapla' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Record<string, unknown>;
      this.hesaplamalar.push(g);
      if (!g.ad || !g.dr || !g.alan) return json({ Status: false, Data: 'Eksik bilgi.' });
      return json({ Status: true, Data: { prim: (Number(g.alan) * 3.75).toFixed(2), dask: (Number(g.alan) * 2.5).toFixed(2) } });
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private sayfa(): FiksturYaniti {
    const radyo = (ad: string, deger: string, metin: string, secili = false) =>
      `<label class="radyo"><input type="radio" name="${ad}" id="${ad}-${deger}" value="${deger}"${secili ? ' checked' : ''}><span>${metin}</span></label>`;
    const liste = (id: string, etiket: string) =>
      `<label>${etiket} <select id="${id}"><option value="">Seçiniz</option>${(DASK_LISTELERI[id] ?? []).map(([d, m]) => `<option value="${d}">${m}</option>`).join('')}</select></label>`;
    return html(`<h1>JetDASK</h1>
      <section><h2>Yenileme</h2>${radyo('Renewal', 'E', 'Evet', true)}${radyo('Renewal', 'H', 'Hayır')}</section>
      <section id="sigortali"><h2>Sigortalı</h2>
        ${radyo('InsuredType', 'O', 'Özel', true)}${radyo('InsuredType', 'T', 'Tüzel')}${radyo('InsuredType', 'P', 'Pasaport')}
        <label>Ülke kodu <input id="MobilePhoneCountry"></label>
        <div id="telefon-kutu"><label>Cep telefonu <input id="TL"></label></div>
        <label id="dogum-kutu">Doğum tarihi <input id="BirthDate"></label>
        <div id="uyruk-kutu" hidden>${liste('Nationality', 'Uyruk')}</div>
        <label>Kimlik no <input id="IdentityNo"></label>
        <button id="RefreshIdentity" type="button">Sorgula</button><button id="QueryPassportNumber" type="button" hidden>Pasaport sorgula</button>
        <div id="IdentityDetail" hidden><span id="identity-name"></span></div>
      </section>
      <section id="adres"><h2>Adres ve poliçe</h2>
        ${liste('InsurerType', 'Sigorta ettiren sıfatı')}
        <label>Adres kodu <input id="AK"></label><button id="RefreshUAVT" type="button">Adres sorgula</button>
        <label>Adres <input id="DR" readonly></label>
        <label>Ada <input id="AD"></label><label>Sayfa <input id="SY"></label><label>Pafta <input id="PF"></label>
        <label>Bağımsız bölüm <input id="BB"></label><label>Parsel <input id="PR"></label>
        <label>Başlangıç <input id="BeginDate" readonly></label>
        <label>Brüt m² <input id="GrossAreaM2"></label>
        ${liste('UsageType', 'Kullanım şekli')}${liste('BuildType', 'İnşa tarzı')}${liste('BuildYear', 'İnşa yılı')}
        ${liste('TotalFloor', 'Toplam kat')}${liste('AnteriorDamage', 'Önceki hasar')}${liste('KT', 'Bulunduğu kat')}
        ${radyo('LP', 'E', 'Dain-i mürtehin var', true)}${radyo('LP', 'Y', 'Yok')}
      </section>
      <section id="islemler"><button id="Hesapla" type="button">Hesapla</button>
        <p>Toplam prim: <span id="premium-total">0,00</span> · DASK: <span id="dask-amount">0,00</span></p>
        <p id="hesap-hatasi"></p>
        <button id="Policelestir" type="button" hidden>Poliçeleştir</button>
        <div id="kart-formu" hidden>
          <label>Kart üzerindeki isim <input id="isim"></label><label>Kart üzerindeki soyisim <input id="soyisim"></label>
          <label>Kart numarası <input id="kartno"></label><label>Güvenlik kodu (CVV) <input id="cvv"></label>
          <label>Ay <select id="ay">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></label>
          <label>Yıl <select id="yil">${Array.from({ length: 11 }, (_, i) => `<option value="${2026 + i}">${2026 + i}</option>`).join('')}</select></label>
          <a href="#" id="odemeyi-tamamla">Ödemeyi tamamla</a>
        </div></section>
      <script>
        const $ = (id) => document.getElementById(id);
        const secili = (ad) => document.querySelector('input[name=' + ad + ']:checked').value;
        const tip = () => { const t = secili('InsuredType');
          $('dogum-kutu').hidden = t === 'T'; $('uyruk-kutu').hidden = t !== 'P';
          $('RefreshIdentity').hidden = t === 'P'; $('QueryPassportNumber').hidden = t !== 'P'; };
        document.querySelectorAll('input[name=InsuredType]').forEach((r) => r.addEventListener('change', tip));
        // Sorgu: ad alanı önce "Aranıyor…", sonra sonuç; sonuç gelince telefon alanı yeniden oluşturulur (boşalır — POM notu).
        const sorgula = async () => {
          $('IdentityDetail').hidden = false; $('identity-name').textContent = 'Aranıyor...';
          const r = await (await fetch('/dask/kimlik?tip=' + secili('InsuredType') + '&no=' + encodeURIComponent($('IdentityNo').value) + '&tel=' + encodeURIComponent($('TL').value))).json();
          setTimeout(() => {
            $('identity-name').textContent = r.Status ? r.Data : 'Hata: ' + r.Data;
            $('telefon-kutu').innerHTML = '<label>Cep telefonu <input id="TL"></label>';
          }, 600);
        };
        $('RefreshIdentity').onclick = sorgula;
        $('QueryPassportNumber').onclick = sorgula;
        const sifatlariYukle = async () => {
          const l = await (await fetch('/dask/sifat-listesi?tip=' + secili('InsuredType'))).json();
          $('InsurerType').length = 1; for (const [d, m] of l) $('InsurerType').add(new Option(m, d));
        };
        document.querySelectorAll('input[name=InsuredType]').forEach((r) => r.addEventListener('change', sifatlariYukle));
        $('RefreshUAVT').onclick = async () => {
          const r = await (await fetch('/dask/uavt?ak=' + encodeURIComponent($('AK').value))).json();
          setTimeout(() => { $('DR').value = r.Data; }, 300);
        };
        // TEST'teki gibi: Poliçeleştir kart formunu doğrudan açar (ara "KREDİ KARTI İLE POLİÇELEŞTİR" bağlantısı yok).
        $('Policelestir').onclick = () => { setTimeout(() => { $('kart-formu').hidden = false; }, 150); };
        $('odemeyi-tamamla').onclick = async (o) => {
          o.preventDefault();
          const govde = { isim: $('isim').value, soyisim: $('soyisim').value, kartNo: $('kartno').value, cvv: $('cvv').value, ay: $('ay').value, yil: $('yil').value };
          const r = await (await fetch('/dask/odeme', { method: 'POST', body: JSON.stringify(govde) })).json();
          setTimeout(() => alert(r.mesaj), 200);
        };
        $('Hesapla').onclick = async () => {
          $('premium-total').textContent = '0,00';
          const t = secili('InsuredType');
          const govde = { yenileme: secili('Renewal'), tip: t, ulkeKodu: $('MobilePhoneCountry').value, tel: $('TL').value,
            dogum: t === 'T' ? null : $('BirthDate').value, uyruk: t === 'P' ? $('Nationality').value : null, no: $('IdentityNo').value,
            ad: $('identity-name').textContent, sifat: $('InsurerType').value, ak: $('AK').value, dr: $('DR').value,
            tapu: [$('AD').value, $('SY').value, $('PF').value, $('BB').value, $('PR').value], baslangic: $('BeginDate').value, alan: $('GrossAreaM2').value,
            kullanim: $('UsageType').value, insa: $('BuildType').value, yil: $('BuildYear').value, kat: $('TotalFloor').value,
            hasar: $('AnteriorDamage').value, bulunduguKat: $('KT').value, dainiMurtehin: secili('LP') };
          const r = await (await fetch('/jet-satis/jet-dask/hesapla', { method: 'POST', body: JSON.stringify(govde) })).json();
          await new Promise((c) => setTimeout(c, 200));
          if (!r.Status) { $('hesap-hatasi').textContent = r.Data; return; }
          $('premium-total').textContent = r.Data.prim.replace('.', ','); $('dask-amount').textContent = r.Data.dask.replace('.', ',');
          $('Policelestir').hidden = false;
        };
      </script>`);
  }
}
