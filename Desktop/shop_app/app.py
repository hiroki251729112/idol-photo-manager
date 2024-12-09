from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# 商品リストとカート
products = {}
carts = {}

# ホーム画面
@app.route("/")
def home():
    return render_template("index.html", products=products, carts=carts)

# 商品を追加
@app.route("/add_product", methods=["POST"])
def add_product():
    name = request.form.get("name")
    price = float(request.form.get("price"))
    if name and price:
        products[name] = price
    return jsonify(products)

# カートに商品を追加
@app.route("/add_to_cart", methods=["POST"])
def add_to_cart():
    user = request.form.get("user")
    item = request.form.get("item")
    quantity = int(request.form.get("quantity"))
    
    if user not in carts:
        carts[user] = {}
    carts[user][item] = carts[user].get(item, 0) + quantity
    return jsonify(carts[user])

# 合計金額計算
@app.route("/calculate_total/<user>", methods=["GET"])
def calculate_total(user):
    if user not in carts:
        return jsonify({"total": 0})
    total = sum(products[item] * qty for item, qty in carts[user].items())
    return jsonify({"total": total})

if __name__ == "__main__":
    app.run(debug=True)
