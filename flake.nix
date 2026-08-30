{
  description = "video-trimmer: exact MP4 trimming for Wayland";
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?rev=0ad6f47ea4fe188f4bc8f0380f93ae8523337c6c";
    bun2nix = { url = "github:nix-community/bun2nix/2.0.8"; inputs.nixpkgs.follows = "nixpkgs"; };
  };
  outputs = { self, nixpkgs, bun2nix }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; overlays = [ bun2nix.overlays.default ]; };
      lib = nixpkgs.lib;
      version = (lib.importTOML ./src-tauri/Cargo.toml).package.version;
      mediaPackages = with pkgs; [ ffmpeg-full gst_all_1.gstreamer gst_all_1.gst-plugins-base gst_all_1.gst-plugins-good gst_all_1.gst-plugins-bad gst_all_1.gst-plugins-ugly gst_all_1.gst-libav gst_all_1.gst-vaapi ];
    in {
      packages.${system}.default = pkgs.rustPlatform.buildRustPackage {
        pname = "video-trimmer"; inherit version; src = self;
        cargoRoot = "src-tauri"; buildAndTestSubdir = "src-tauri"; cargoLock.lockFile = ./src-tauri/Cargo.lock;
        bunDeps = pkgs.bun2nix.fetchBunDeps { bunNix = ./bun.nix; };
        dontUseBunBuild = true; dontUseBunCheck = true; dontUseBunInstall = true;
        nativeBuildInputs = [ pkgs.bun2nix.hook pkgs.pkg-config pkgs.wrapGAppsHook3 pkgs.ffmpeg-full ];
        buildInputs = with pkgs; [ dbus glib gtk3 librsvg webkitgtk_4_1 ] ++ mediaPackages;
        preBuild = "bun run build";
        preFixup = ''
          gappsWrapperArgs+=(
            --set GDK_BACKEND wayland
            --prefix PATH : "${lib.makeBinPath [ pkgs.ffmpeg-full ]}"
            --prefix GST_PLUGIN_SYSTEM_PATH_1_0 : "${lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" mediaPackages}"
          )
        '';
        meta = { description = "Minimal exact MP4 trimmer for Hyprland"; license = lib.licenses.mit; mainProgram = "video-trimmer"; platforms = [ system ]; };
      };
      apps.${system}.default = { type = "app"; program = "${self.packages.${system}.default}/bin/video-trimmer"; };
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [ cargo clippy rustc rustfmt bun pkg-config dbus webkitgtk_4_1 gtk3 glib librsvg ] ++ mediaPackages;
        shellHook = ''
          export GDK_BACKEND=wayland
          export GST_PLUGIN_SYSTEM_PATH_1_0="${lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" mediaPackages}"
        '';
      };
    };
}
