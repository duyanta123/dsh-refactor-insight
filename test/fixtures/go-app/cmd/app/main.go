package main

import "fmt"

// TODO: move this into internal package
func main() {
	runner(3)
}

func runner(level int) {
	for i := 0; i < level; i++ {
		if i > 0 {
			step(func() {
				if level > 2 {
					for j := 0; j < level; j++ {
						if j > 1 {
							// FIXME: propagate error instead
							fmt.Println(j)
						}
					}
				}
			})
		}
	}
}