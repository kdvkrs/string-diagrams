WWW=~/work/public_html/string-diagrams/

all:: test

build::
	dune build

test::
	dune build
	OCAMLRUNPARAM=b dune runtest
	OCAMLRUNPARAM=b dune exec ./bin/check.exe -- *.sd

run::
	dune build
	OCAMLRUNPARAM=b dune runtest
	OCAMLRUNPARAM=b dune exec ./bin/sd.exe -- mumu

www::
	dune runtest
	dune build ./bin/applet.bc.js
	cp ./www/hip.css ./www/index.html _build/default/bin/applet.bc.js $(WWW)

www-local::
	dune build ./bin/applet.bc.js
	cp _build/default/bin/applet.bc.js ./www/applet.bc.js

clean::
	dune clean

web-next-bridge::
	opam exec -- dune build ./bin/bridge.bc.js
	mkdir -p web-next/public
	install -m 0644 _build/default/bin/bridge.bc.js web-next/public/bridge.bc.js

web-next-dev:: web-next-bridge
	cd web-next && npm run dev -- --host

web-next-build:: web-next-bridge
	cd web-next && npm run build

web-next-build-perf:: web-next-bridge
	cd web-next && npm run build:perf

web-next-serve:: web-next-build
	python3 -m http.server 8080 --directory web-next/dist

web-next-serve-perf:: web-next-build-perf
	python3 -m http.server 8080 --directory web-next/dist

archive:
	git archive --prefix string-diagrams/ main | bzip2 > string-diagrams.tar.bz2
