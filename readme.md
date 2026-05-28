# Buildear (puede tardar 20-40 min la primera vez)
docker build -t kali-hexstrike:full . 2>&1 | tee build.log

# Correr (con capacidades de red para nmap/masscan)
docker run -d \
  -p 8888:8888 \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  kali-hexstrike:full

# Verificar que arrancó
curl http://localhost:8888/health