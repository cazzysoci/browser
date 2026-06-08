import os
import sys
import httpx
from colorama import Fore, init
init(autoreset=True)

fr = Fore.RED
fg = Fore.GREEN
fy = Fore.YELLOW
fw = Fore.WHITE
fre = Fore.RESET

list = [ 
'https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks4.txt',
'https://proxyspace.pro/',
'https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/http.txt',
'https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/https.txt',
'https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt',
'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/https.txt',
'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt',
'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt',
'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
'https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/http.txt',
'https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt',
'https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt',
'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
'https://raw.githubusercontent.com/proxylist-to/proxy-list/main/http.txt',
'https://raw.githubusercontent.com/yuceltoluyag/GoodProxy/main/raw.txt',
'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt',
'https://raw.githubusercontent.com/mmpx12/proxy-list/master/https.txt',
'https://api.proxyscrape.com/?request=displayproxies&proxytype=http',
'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
'https://www.proxydocker.com/en/proxylist/download?email=noshare&country=all&city=all&port=all&type=all&anonymity=all&state=all&need=all',
'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=anonymous',
'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt',
'https://spys.one/free-proxy-list/',
'https://www.proxy-list.download/api/v1/get?type=http&anon=elite&country=US',
'https://www.proxy-list.download/api/v1/get?type=http&anon=transparent&country=US',
'https://api.proxyscrape.com/v2/?request=displayproxies',
'https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt',
'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
'https://raw.githubusercontent.com/yuceltoluyag/GoodProxy/main/raw.txt',
'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt',
'https://raw.githubusercontent.com/mmpx12/proxy-list/master/https.txt',
'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies.txt',
'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt',
'https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt',
'https://proxyspace.pro/http.txt',
'https://api.proxyscrape.com/?request=displayproxies&proxytype=http',
'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
'http://worm.rip/http.txt',
'http://alexa.lr2b.com/proxylist.txt',
'https://api.openproxylist.xyz/http.txt',
'http://rootjazz.com/proxies/proxies.txt',
'https://multiproxy.org/txt_all/proxy.txt',
'https://proxy-spider.com/api/proxies.example.txt',
'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
'https://www.proxydocker.com/en/proxylist/download?email=noshare&country=all&city=all&port=all&type=all&anonymity=all&state=all&need=all',
'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=anonymous',
'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt',
'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt',

]  
         

if __name__ == "__main__":
    file = "proxy.txt"
    
    try:
        if os.path.isfile(file):
            os.system('cls' if os.name == 'nt' else 'clear')
            os.remove(file)
            print("{}File {} \n{}Wait {} file is still creating\n".format(fr, file, fy, file))
            with open(file, 'a') as data:
                for proxy in list:
                    data.write(httpx.get(proxy).text)
                    print(" -| installing proxy {}{}".format(fg, proxy))
        else:
            os.system('cls' if os.name == 'nt' else 'clear')
            with open(file, 'a') as data:
                for proxy in list:
                    data.write(httpx.get(proxy).text)
                    print(" -| mengambil {}{}".format(fg, proxy))
    
        with open(file, 'r') as count:
            total = sum(1 for line in count)
        print("\n{}( {}{} {}) {}Proxy successfully created.". format(fw, fy, total, fw, fg))
    
    except IndexError:
        sys.exit(1)
        
