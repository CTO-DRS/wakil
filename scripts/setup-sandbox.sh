#!/usr/bin/env bash
# Rebuild the Wakil build toolchain on a fresh linux-aarch64 sandbox.
set -ex
cd /tmp
# JDK 17
if [ ! -x /opt/jdk17/bin/java ]; then
  curl -fsSL -o jdk.tgz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/aarch64/jdk/hotspot/normal/eclipse"
  sudo mkdir -p /opt/jdk17 && sudo tar xzf jdk.tgz -C /opt/jdk17 --strip-components=1 && rm jdk.tgz
  for c in /usr/local/share/ca-certificates/*.crt /etc/ssl/certs/ca-certificates.crt; do :; done
  # import system bundle certs (includes gateway CA)
  python3 - <<'EOF'
import re,subprocess
pem=open('/etc/ssl/certs/ca-certificates.crt').read()
certs=re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----',pem,re.S)
for i,c in enumerate(certs[-20:]):
    open(f'/tmp/c{i}.pem','w').write(c)
    subprocess.run(['sudo','/opt/jdk17/bin/keytool','-importcert','-noprompt','-cacerts','-storepass','changeit','-alias',f'sys{i}','-file',f'/tmp/c{i}.pem'],capture_output=True)
EOF
fi
# SDK
if [ ! -d /opt/sdk/platforms/android-35 ]; then
  sudo mkdir -p /opt/sdk/platforms /opt/sdk/build-tools && sudo chown -R $(id -u) /opt/sdk
  curl -fsSL -o p.zip https://dl.google.com/android/repository/platform-35_r02.zip
  curl -fsSL -o b.zip https://dl.google.com/android/repository/build-tools_r35_linux.zip
  unzip -q p.zip -d /opt/sdk/platforms && mv /opt/sdk/platforms/android-* /opt/sdk/platforms/android-35 2>/dev/null || true
  unzip -q b.zip -d /opt/sdk/build-tools && mv /opt/sdk/build-tools/android-* /opt/sdk/build-tools/35.0.0 2>/dev/null || true
  rm p.zip b.zip
  mkdir -p /opt/sdk/licenses && printf '\n24333f8a63b6825ea9c5514f83c2829b004d1fee\n' > /opt/sdk/licenses/android-sdk-license
fi
# qemu for x86 aapt2
if ! command -v qemu-x86_64 >/dev/null; then
  sudo dpkg --add-architecture amd64 || true
  sudo apt-get update -qq >/tmp/apt.log 2>&1 || true
  sudo apt-get install -y -qq qemu-user libc6:amd64 libstdc++6:amd64 zipalign >>/tmp/apt.log 2>&1 || sudo apt-get install -y -qq qemu-user libc6:amd64 libstdc++6:amd64 >>/tmp/apt.log 2>&1
fi
mkdir -p ~/bin
cat > ~/bin/aapt2 <<'EOF'
#!/usr/bin/env bash
exec qemu-x86_64 -L / /opt/sdk/build-tools/35.0.0/aapt2 "$@"
EOF
chmod +x ~/bin/aapt2
# gradle props
mkdir -p ~/.gradle/init.d
python3 - <<'EOF'
import os,urllib.parse as u
p=u.urlparse(os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy'))
user=u.unquote(p.username or ''); pw=u.unquote(p.password or '')
lines=[f"systemProp.{s}.proxyHost={p.hostname}" for s in ('http','https')]+[f"systemProp.{s}.proxyPort={p.port}" for s in ('http','https')]
lines+= [f"systemProp.{s}.proxyUser={user}" for s in ('http','https')]+[f"systemProp.{s}.proxyPassword={pw}" for s in ('http','https')]
lines+=["systemProp.jdk.http.auth.tunneling.disabledSchemes=","systemProp.jdk.http.auth.proxying.disabledSchemes=",
 "org.gradle.java.home=/opt/jdk17","android.aapt2FromMavenOverride="+os.path.expanduser('~/bin/aapt2'),
 "org.gradle.jvmargs=-Xmx1600m","kotlin.daemon.jvmargs=-Xmx1200m","org.gradle.daemon=false"]
open(os.path.expanduser('~/.gradle/gradle.properties'),'w').write("\n".join(lines)+"\n")
EOF
cat > ~/.gradle/init.d/builddir.gradle <<'EOF'
allprojects { layout.buildDirectory.set(new File("/tmp/wakil-build/${project.name}")) }
EOF
echo "sdk.dir=/opt/sdk" > /workspace/projects/63d46980-7164-4457-910d-060f812d1fca/wakil/local.properties
echo SETUP_DONE
