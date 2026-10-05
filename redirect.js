// Начальная длительность ожидания перед возвратом на страницу записи.
let seconds = 360;
// Элемент страницы, в котором отображается оставшееся число секунд.
const timer = document.querySelector(".timer");

// Обновляет счетчик раз в секунду и перенаправляет на официальный портал по завершении.
const interval = setInterval(() => {
  seconds--;
  timer.textContent = seconds;
  if (seconds <= 0) {
    clearInterval(interval);
    window.location.href = "https://sede.administracionespublicas.gob.es/pagina/index/directorio/icpplus"; 
  }
}, 1000);
