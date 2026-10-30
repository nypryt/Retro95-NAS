FROM ubuntu:24.04

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential cmake zlib1g-dev git ca-certificates hfsprogs hfsplus \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/planetbeing/libdmg-hfsplus.git /opt/libdmg \
 && cd /opt/libdmg \
 && cmake . \
 && make -j4

ENV PATH="/opt/libdmg/dmg:/opt/libdmg/hfs:/opt/libdmg/hdutil:${PATH}"
WORKDIR /work
