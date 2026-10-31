# Retro95 NAS

A retro-inspired Network Attached Storage application featuring a classic Windows 95-style interface, bringing nostalgic desktop computing to modern storage.

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.1-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Windows-x64-blue?style=for-the-badge&logo=windows" alt="Windows">
  <img src="https://img.shields.io/badge/macOS-x64-black?style=for-the-badge&logo=apple" alt="macOS">
  <img src="https://img.shields.io/badge/Linux-x64-orange?style=for-the-badge&logo=linux" alt="Linux">
  <img src="https://img.shields.io/badge/Architecture-x86__64-informational?style=for-the-badge" alt="Architecture">
</p>

---

## Table of Contents

- [Features](#features)
- [System Requirements](#system-requirements)
- [Storage Recommendations](#storage-recommendations)
- [Compatibility](#compatibility)
- [Installation](#installation)
  - [Windows](#windows-installation)
  - [macOS](#macos-installation)
  - [Linux](#linux-installation)
- [First-Time Setup](#first-time-setup)
- [Port Configuration](#port-configuration)
- [Docker Integration](#docker-integration)
- [Tailscale Integration](#tailscale-integration)
- [Network Access](#network-access)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Support](#support)

---

## Features

- Windows 95-inspired desktop interface.
- Network Attached Storage functionality.
- Cross-platform support for Windows, macOS and Linux.
- Native macOS and Linux support.
- Integrated Paint application.
- Docker integration.
- Tailscale integration.
- Configurable application port.
- Browser-based interface.
- Retro-inspired desktop experience.

---

## System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| Operating System | Windows 10, macOS, Linux | Latest supported version |
| Architecture | x86-64 | x86-64 |
| CPU | Dual-core processor | Quad-core processor or better |
| RAM | 2 GB | 8 GB or more |
| Application Storage | 20 MB free | 200 GB free |
| NAS Storage | 1 GB free | 2 GB - 64 GB or more |
| Network | Wi-Fi or Mobile Hotspot | Ethernet |
| Python | 3.11+ where required | 3.15+ |

> Python installation requirements depend on the platform installer. Windows users do not need to manually install Python when using the official installer.

## Storage Recommendations

Retro95 NAS is designed for storing files, documents, photos, videos and other data.

The following table provides suggested NAS storage capacities:

| Usage | Suggested Capacity |
|---|---:|
| Basic personal storage | 12 GB |
| Documents and photos | 24 GB |
| General NAS usage | 32 - 64 GB |
| Large media libraries | 128 - 256 GB |
| Extensive storage collections | 512 GB or more |

These are recommendations, not application-imposed storage limits.

**Application storage and NAS storage are separate requirements.** The application itself requires relatively little space, while your NAS storage capacity depends on the files you intend to store.

---

## Compatibility

Retro95 NAS currently supports x86-64 systems only.

| Operating System | Architecture | Support |
|---|---|---|
| Windows 10 | x64 | Supported |
| Windows 11 | x64 | Supported |
| macOS | Intel x64 | Supported |
| Linux | x86_64 | Supported |
| ARM64 | AArch64 | Unsupported |
| ARM32 | ARM | Unsupported |
| Other architectures | Various | Unsupported |

> ARM64 and other non-x64 architectures are currently unsupported.

---

# Installation

Download the appropriate installer from the official GitHub Releases page.

**[Download Retro95 NAS - Latest Release](https://github.com/nypryt/Retro95-NAS/releases/latest)**

Select the installer matching your operating system.

Do not download the repository source code or use Git to install Retro95 NAS.

---

## Windows Installation

Windows installation is designed to be straightforward. The installer handles the setup process and automatically launches Retro95 NAS when installation is complete.

### Step 1. Download the Installer

1. Visit the [latest Retro95 NAS release](https://github.com/nypryt/Retro95-NAS/releases/latest).
2. Locate the `Assets` section.
3. Download the Windows x64 installer.
4. Wait for the download to finish.

**Important:** Download the installer from the latest release's Assets section. Do not download the source code ZIP files.

### Step 2. Run the Installer

1. Open your Downloads folder.
2. Double-click the downloaded Retro95 NAS installer.
3. Follow the instructions displayed by the installer.
4. Select your preferred installation options.
5. Complete the installation.

### Step 3. Automatic Launch

After installation completes, Retro95 NAS automatically starts.

Your default browser will automatically open:

`http://localhost:4040`

You can now access the Retro95 NAS interface.

### Starting Retro95 NAS Again

To start Retro95 NAS after closing it:

1. Navigate to your Retro95 NAS installation folder.
2. Locate `Start.bat`.
3. Double-click `Start.bat`.

Retro95 NAS will start again using its configured port.

### Port Already in Use

If `localhost:4040` is already occupied by another application:

1. Run the Retro95 NAS installer again.
2. Continue through the installation instructions.
3. When prompted for the application port, select a different available port.
4. Complete the installation.

Use the newly configured port to access Retro95 NAS.

For example:

`http://localhost:8080`

---

## macOS Installation

Retro95 NAS supports Intel-based Macs running macOS.

### Step 1. Download the Installer

1. Visit the [latest Retro95 NAS release](https://github.com/nypryt/Retro95-NAS/releases/latest).
2. Locate the `Assets` section.
3. Download the macOS x64 installer.

### Step 2. Install Retro95 NAS

1. Open the downloaded installer.
2. Follow the installation instructions.
3. Complete the installation process.
4. Launch Retro95 NAS.

### Step 3. Access Retro95 NAS

Open your browser and navigate to:

`http://localhost:4040`

If you selected a different port during setup, use that port instead.

---

## Linux Installation

Retro95 NAS supports x86-64 Linux distributions.

### Step 1. Download the Installer

1. Visit the [latest Retro95 NAS release](https://github.com/nypryt/Retro95-NAS/releases/latest).
2. Open the `Assets` section.
3. Download the Linux x64 ELF installer.

### Step 2. Make the Installer Executable

Open a terminal in the download directory.

```bash
chmod +x ./Win95NAS-Installer.elf
```

### Step 3. Run the Installer

```bash
./Win95NAS-Installer.elf
```

### Step 4. Complete Installation

Follow the installer instructions and allow the installation to complete.

### Step 5. Access Retro95 NAS

Open your browser:

`http://localhost:4040`

If you configured another port, use the selected port.

---

## First-Time Setup

After installation, Retro95 NAS initializes its application environment.

Complete the available setup instructions and configure your preferred settings.

Recommended first-time configuration:

1. Verify that Retro95 NAS starts correctly.
2. Open the web interface.
3. Configure your storage locations.
4. Review application settings.
5. Configure optional integrations if required.
6. Verify network accessibility.

Keep your application data and NAS storage directories intact when updating the application.

---

## Port Configuration

Retro95 NAS uses port `4040` by default.

The web interface is accessible through:

`http://localhost:4040`

### Changing the Port

If port 4040 is already occupied:

1. Run the installer again.
2. Select a different available port when prompted.
3. Complete the installation.
4. Open Retro95 NAS using the newly selected port.

Example configurations:

| Port | Local Address |
|---|---|
| 4040 | `http://localhost:4040` |
| 8080 | `http://localhost:8080` |
| 3000 | `http://localhost:3000` |

These are example ports, not guaranteed available ports.

---

# Docker Integration

Retro95 NAS provides optional Docker integration for systems with Docker installed.

Docker integration allows Retro95 NAS to interact with Docker through the Docker CLI.

### Enabling Docker Integration

During installation:

1. Locate the Docker Integration option.
2. Enable it if you want Docker functionality.
3. Continue with the installation.

### Docker Detection

The installer checks whether the Docker CLI is available.

**If Docker CLI is detected:**

- Retro95 NAS can use the existing Docker installation.
- An additional Docker installation is unnecessary.

**If Docker CLI is not detected:**

- The installer checks whether Docker Desktop is available.
- If Docker Desktop is missing, the installer offers to download and install it.
- Docker Desktop installation is handled through its official installation process.

### Windows Docker Installation

Docker Desktop can be installed using its official Windows installer.

Official download:

https://www.docker.com/products/docker-desktop/

Default installation locations include:

- Per-user installation: `%LOCALAPPDATA%\Programs\DockerDesktop`
- All-users installation: `C:\Program Files\Docker\Docker`

Docker Desktop may require WSL 2 and a system restart.

### Docker Availability

Docker CLI detection does not necessarily mean the Docker engine is running.

The integration should verify that the Docker engine is available before attempting Docker operations.

Check Docker manually:

```bash
docker --version
```

Check whether the Docker engine is running:

```bash
docker info
```

Official documentation:

https://docs.docker.com/

---

# Tailscale Integration

Retro95 NAS provides optional Tailscale integration for private network connectivity.

Tailscale allows devices in your private tailnet to communicate without requiring traditional router port forwarding.

### Enabling Tailscale Integration

During installation:

1. Locate the Tailscale Integration option.
2. Enable it if you want Tailscale functionality.
3. Continue with installation.

### Tailscale Detection

The installer checks whether Tailscale is installed.

**If Tailscale is detected:**

- Retro95 NAS can use the existing Tailscale installation.
- An additional Tailscale installation is unnecessary.

**If Tailscale is not detected:**

- The installer offers to download Tailscale.
- Follow the official Tailscale installation instructions.
- Authenticate your device when prompted.

Official website:

https://tailscale.com/

### Connecting Through Tailscale

Once Tailscale is installed and connected:

1. Ensure the host computer is connected to your tailnet.
2. Ensure the accessing device is also connected to the same tailnet.
3. Identify the host computer's Tailscale IP address.
4. Open a browser on the accessing device.
5. Navigate to the host IP and Retro95 NAS port.

Example:

`http://100.x.x.x:4040`

Replace the example IP address with the actual Tailscale IP address of your host computer.

The application must be configured to accept connections through the relevant network interface.

---

## Network Access

Retro95 NAS provides browser-based access.

### Local Access

On the computer running Retro95 NAS:

`http://localhost:4040`

### Local Network Access

From another device on the same accessible network:

`http://YOUR-LOCAL-IP:4040`

### Tailscale Access

From another device connected to your tailnet:

`http://YOUR-TAILSCALE-IP:4040`

Replace the example addresses and port with your actual configuration.

Ensure that your firewall and application listening configuration permit the connection.

---

## Troubleshooting

### Retro95 NAS Does Not Automatically Open

Verify that the installation completed successfully.

On Windows, open the installation folder and double-click:

`Start.bat`

### Port 4040 Is Already in Use

Run the installer again and select a different available port when prompted.

### Cannot Access the Web Interface

Verify that Retro95 NAS is running and that you are using the correct port.

### Docker CLI Is Not Detected

Check whether Docker is installed:

```bash
docker --version
```

If Docker is missing, install Docker Desktop using its official installer.

### Docker Engine Is Not Running

Run:

```bash
docker info
```

If the Docker engine is unavailable, start Docker Desktop and wait for it to initialize.

### Tailscale Is Not Detected

Verify that Tailscale is installed and running.

Official installation instructions:

https://tailscale.com/download

### Cannot Access Retro95 NAS Through Tailscale

Check the following:

- Both devices are connected to the same tailnet.
- Tailscale is running on both devices.
- The host application accepts network connections.
- The correct Tailscale IP address is being used.
- The configured application port is accessible.

---

## Security Recommendations

- Use strong authentication credentials.
- Avoid exposing administrative interfaces directly to the public internet.
- Review Docker permissions carefully.
- Keep Tailscale authentication secure.

---

## Support

Need help or found a bug?

- [GitHub Repository](https://github.com/nypryt/Retro95-NAS)
- [Latest Releases](https://github.com/nypryt/Retro95-NAS/releases/latest)
- [Report an Issue](https://github.com/nypryt/Retro95-NAS/issues)

---

## License

Retro95 NAS is distributed under the license specified in this repository.

---

<p align="center">
  <strong>Retro95 NAS</strong><br>
  Retro computing meets modern storage.
</p>
