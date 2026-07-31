function createEmergencyQrCode() {
  const container = document.getElementById("qrCode");
  if (!container) return;

  if (typeof QRCode === "undefined") {
    container.textContent = "QR library unavailable";
    return;
  }

  container.innerHTML = "";
  new QRCode(container, {
    text: window.location.href,
    width: 160,
    height: 160,
    colorDark: "#111820",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}
createEmergencyQrCode();
