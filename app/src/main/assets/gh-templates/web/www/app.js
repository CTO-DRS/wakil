let count = 0;
const label = document.getElementById('count');

document.getElementById('btn').addEventListener('click', () => {
  count++;
  label.textContent = `ضغطت ${count} مرة`;
  if (navigator.vibrate) navigator.vibrate(15);
});
