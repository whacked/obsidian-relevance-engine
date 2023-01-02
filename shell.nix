{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = [
    pkgs.yarn
    pkgs.nodejs
  ];  # join lists with ++

  nativeBuildInputs = [
    ~/setup/bash/node_shortcuts.sh
    ~/setup/bash/nix_shortcuts.sh
  ];

  shellHook = ''
    activate-yarn-env
    alias dev='yarn run dev'
  '' + ''
    echo-shortcuts ${__curPos.file}
  '';  # join strings with +
}
