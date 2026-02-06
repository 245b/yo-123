const btn = document.getElementById("pulse")
const card = document.querySelector(".card")
const status = document.getElementById("status")

const stamp = () => {
  const now = new Date()
  return now.toLocaleTimeString()
}

const run = () => {
  if (!btn || !card || !status) {
    return
  }

  card.classList.remove("flash")
  void card.offsetWidth
  card.classList.add("flash")
  status.textContent = "Hello World animation triggered at " + stamp()
}

if (btn) {
  btn.addEventListener("click", run)
}

if (status) {
  status.textContent = "Ready at " + stamp()
}
