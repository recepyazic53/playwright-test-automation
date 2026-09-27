// Kasa açma / kilitleme / parola değiştirme sırası (sunucu-platform.mjs). Açma ve parola değiştirme await eder (KDF); bu arada
// gelen bir "Tamamen kilitle" önce biter de ardından süren açma anahtarı belleğe geri koyarsa kullanıcı "kilitlendi" gördüğü hâlde
// kasa açık kalırdı. Sıra, her işlemi geliş sırasına göre bir öncekinin bitmesinden (başarı ya da hata) sonra çalıştırır.
// Tipler: kasa-sirasi.d.mts.

/** @returns {<T>(fn: () => T | Promise<T>) => Promise<T>} */
export function siraOlustur() {
  /** @type {Promise<void>} */
  let kuyruk = Promise.resolve();
  return (fn) => {
    const sonuc = kuyruk.then(fn);
    kuyruk = sonuc.then(() => {}, () => {});
    return sonuc;
  };
}
