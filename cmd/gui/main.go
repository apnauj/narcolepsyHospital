// Comando gui sirve la interfaz gráfica del hospital: la API bajo /api/ y
// el frontend embebido en todo lo demás.
//
//	go run ./cmd/gui            # http://localhost:8080
//	go run ./cmd/gui -addr :9000
package main

import (
	"flag"
	"log"
	"net/http"

	"objetosCostenos/api"
	"objetosCostenos/web"
)

func main() {
	addr := flag.String("addr", "localhost:8080", "dirección en la que escucha el servidor")
	flag.Parse()

	server, err := api.New()
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/api/", server.Handler())
	mux.Handle("/", http.FileServerFS(web.FS))

	log.Printf("interfaz gráfica en http://%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
