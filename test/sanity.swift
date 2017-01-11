let x = 2
var y = x*2
struct SA {
    var sa_a_String = "I'am a String in SA."
    var sa_b_Int = 123
    var sa_c_boolean = true
}
class CA {
    var ca_a_tuple = (200, "OK")
    let ca_b_list = ["a","b","c"]
    let ca_c_map = ["red":0xff0000,"green":0x00ff00,"blue":0x0000ff]
    var ca_d_sa = SA()
} 

func add(_ x: Int, _ y: Int) -> Int {
 return x+y
}

print("x+y is \(add(x,y))")
let ca = CA()
print("ca.ca_d_sa: \(ca.ca_d_sa.sa_a_String)")
